var Packet = require('./packet');
var Vector = require('./modules/Vector');
var Rectangle = require('./modules/Rectangle');

function getTime(a) {
    return a[0] * 1000 + a[1] / 1000000;
}

function PlayerTracker(gameServer, socket) {
    this.pID = -1;
    this.disconnect = -1; // Disconnection
    this.fullyDisconnected = false;
    this.name = "";
    this.gameServer = gameServer;
    this.socket = socket;

    this.nodeAdditionQueue = [];
    this.nodeDestroyQueue = [];
    this.visibleNodes = [];
    this.clientNodeMap = {};

    this.cells = [];
    this.mergeOverride = false; // Triggered by console command
    this.score = 0; // Needed for leaderboard

    this.mouse = new Vector(0, 0);
    this.centerPos = new Vector(0, 0);
    this.color = {
        r: 0,
        g: 0,
        b: 0
    };
    this.lastEject = new Date();
    this.tickLeaderboard = 0;
    this.tickViewBox = 0;
    this.viewScale = 1;

    this.team = 0;
    this.spectate = false;
    this.freeRoam = false; // Free-roam mode enables player to move in spectate mode

    // Anti-teaming
    this.checkForWMult = false; // Prevent oveload with W multiplier
    this.massDecayMult = 1; // Anti-teaming multiplier

    this.massLossMult = 0; // When mass is lost, it applies here
    this.massGainMult = 0; // When mass is gained, it applies here

    // Scramble systems
    this.scrambleX = 0;
    this.scrambleY = 0;
    this.scrambleID = 0;
    this.scrambleColor = {
        from: -1,
        to: -1
    };

    // Gamemode function
    if (gameServer) {
        // Player id
        this.pID = gameServer.getNewPlayerID();
        // Gamemode function
        gameServer.gameMode.onPlayerInit(this);
        this.resetScramble();
    }
}

module.exports = PlayerTracker;

// Setters/Getters

PlayerTracker.prototype.setName = function(name) {
    this.name = name;
};

PlayerTracker.prototype.getName = function() {
    return this.name;
};

PlayerTracker.prototype.getScore = function(reCalcScore) {
    if (reCalcScore) {
        var s = 0;
        for (var i = 0; i < this.cells.length; i++) {
            if (!this.cells[i]) return; // Error
            s += this.cells[i].mass;
            this.score = s;
        }
    }
    return this.score >> 0;
};

PlayerTracker.prototype.getSizes = function() {
    var s = 0;
    for (var i = 0; i < this.cells.length; i++) {
        if (!this.cells[i]) return; // Error
        s += this.cells[i].getSize();
    }
    return s;
};

PlayerTracker.prototype.setColor = function(color) {
    if (!color) return;
    this.color = {
        r: color.r !== undefined ? color.r : 0,
        g: color.g !== undefined ? color.g : 0,
        b: color.b !== undefined ? color.b : 0
    };
};

PlayerTracker.prototype.getTeam = function() {
    return this.team;
};

// Functions

PlayerTracker.prototype.resetScramble = function() {
    if (this.gameServer.config.scrambleCoords >= 1) {
        this.scrambleX = Math.floor((1 << 15) * (Math.random() - 0.5) * 2);
        this.scrambleY = Math.floor((1 << 15) * (Math.random() - 0.5) * 2);
    } else {
        this.scrambleX = 0;
        this.scrambleY = 0;
    }
    if (this.gameServer.config.scrambleIDs >= 1) this.scrambleID = Math.random() * 2147483648 >> 0;
    else this.scrambleID = 0;
    if (this.gameServer.config.scrambleColors >= 1) this.scrambleColor = {
            from: Math.random() * 3 >> 0,
            to: Math.random() * 3 >> 0
        };
    else this.scrambleColor = {
            from: -1,
            to: -1
        };
};

PlayerTracker.prototype.update = function() {
    // Don't send any messages if client didn't respond with protocol version
    if (this.socket.packetHandler.protocolVersion == 0) return;

    // Actions buffer (So that people cant spam packets)
    if (this.socket.packetHandler.pressSpace) { // Split cell
        if (!this.mergeOverride) this.gameServer.gameMode.pressSpace(this.gameServer, this);
        this.socket.packetHandler.pressSpace = false;
    }

    if (this.socket.packetHandler.pressW) { // Eject mass
        var canEject = this.gameServer.nodeHandler.canEjectMass(this);
        if (canEject) {
            this.gameServer.gameMode.pressW(this.gameServer, this);
            this.socket.packetHandler.pressW = false;
            this.checkForWMult = true;
        } else {
            // Check if player even has cells with enough mass to eject
            var hasEnoughMass = false;
            for (var c = 0; c < this.cells.length; c++) {
                if (this.cells[c] && this.cells[c].mass >= this.gameServer.config.playerMinMassEject) {
                    hasEnoughMass = true;
                    break;
                }
            }
            if (!hasEnoughMass) {
                this.socket.packetHandler.pressW = false;
            }
        }
    }

    if (this.socket.packetHandler.pressQ) { // Q Press
        this.gameServer.gameMode.pressQ(this.gameServer, this);
        this.socket.packetHandler.pressQ = false;
    }

    // Continuously update spectate camera position & zoom on every tick (25 updates/sec)
    if (this.spectate) {
        if (!this.freeRoam) {
            this.updateSpectatePosition();
        } else {
            this.updateFreeRoamPosition();
        }
    }

    var updateNodes = []; // Nodes that need to be updated via packet
    var nonVisibleNodes = []; // Nodes that are not visible anymore
    var removedNodeIds = new Set();

    // 1. Process destroy queue: any node destroyed on server is sent to client for removal
    for (var i = 0; i < this.nodeDestroyQueue.length; i++) {
        var dNode = this.nodeDestroyQueue[i];
        if (!dNode) continue;
        var dId = dNode.nodeId;
        if (!removedNodeIds.has(dId)) {
            nonVisibleNodes.push(dNode);
            removedNodeIds.add(dId);
        }
        delete this.clientNodeMap[dId];
    }

    // 2. Query visible nodes in viewport
    var newNodes = this.viewReset();
    var currentMap = {};

    for (var i = 0; i < newNodes.length; i++) {
        var n = newNodes[i];
        if (!n || n.eaten) continue;
        var nId = n.nodeId;
        currentMap[nId] = n;
        updateNodes.push(n);
        this.clientNodeMap[nId] = n;
    }

    // 3. Find nodes that left viewport
    for (var id in this.clientNodeMap) {
        if (!currentMap[id]) {
            var trackedNode = this.clientNodeMap[id] || { nodeId: +id, getKiller: function() { return null; } };
            if (!removedNodeIds.has(+id)) {
                nonVisibleNodes.push(trackedNode);
                removedNodeIds.add(+id);
            }
            delete this.clientNodeMap[id];
        }
    }

    this.visibleNodes = newNodes;

    // Send packet
    this.socket.sendPacket(new Packet.UpdateNodes(
        updateNodes,
        nonVisibleNodes,
        this,
        this.socket.packetHandler.protocolVersion
    ));

    this.nodeDestroyQueue = []; // Reset destroy queue
    this.nodeAdditionQueue = []; // Reset addition queue

    // Update leaderboard & live server player count (only every 5 ticks)
    if (this.gameServer.tickLB == 5) {
        this.socket.sendPacket(new Packet.UpdateLeaderboard(
            this.gameServer.leaderboard,
            this.gameServer.gameMode.packetLB,
            this.socket.packetHandler.protocolVersion,
            this.pID
        ));
        if (Packet.ServerStats) {
            this.socket.sendPacket(new Packet.ServerStats(
                this.gameServer.getHumanCount(),
                90
            ));
        }

        if (this.spectate || this.cells.length == 0) {
            this.socket.sendPacket(new Packet.SetBorder(
                this.gameServer.config.borderLeft + this.scrambleX,
                this.gameServer.config.borderRight + this.scrambleX,
                this.gameServer.config.borderTop + this.scrambleY,
                this.gameServer.config.borderBottom + this.scrambleY
            ));
        } else {
            var box = this.getBox().getBounds();
            this.socket.sendPacket(new Packet.SetBorder(
                Math.min(box.left + this.scrambleX, this.gameServer.config.borderLeft + this.scrambleX),
                Math.max(box.right + this.scrambleX, this.gameServer.config.borderRight + this.scrambleX),
                Math.min(box.top + this.scrambleY, this.gameServer.config.borderTop + this.scrambleY),
                Math.max(box.bottom + this.scrambleY, this.gameServer.config.borderBottom + this.scrambleY)
            ));
        }
    }

    // Handles disconnections
    if (this.disconnect > -1) {
        // Player has disconnected... remove it when the timer hits -1
        this.disconnect--;
        // Also remove it when its cells are completely eaten not to back up dead clients
        if (this.disconnect == -1 || this.cells.length == 0) {
            // Remove all client cells
            var len = this.cells.length;

            for (var i = 0; i < len; i++) {
                var cell = this.cells[0];
                if (!cell) continue;

                this.gameServer.removeNode(cell);
            }

            this.fullyDisconnected = true;
            this.gameServer.clients.remove(this.socket);
        }
    }
};

PlayerTracker.prototype.getAntiteamMult = function() {
    return Math.min((this.massLossMult + this.massGainMult) / (this.getScore(true) / 2), 2.8);
};

PlayerTracker.prototype.antiTeamTick = function() {
    // ANTI-TEAMING DECAY
    // Calculated even if anti-teaming is disabled.
    this.massLossMult *= 0.997;
    this.massGainMult *= 0.997;
    var div = this.getAntiteamMult();
    if (div > 1) this.massDecayMult = div;
};

PlayerTracker.prototype.applyTeaming = function(n, type) {
    // Called when player does an action which increases anti-teaming
    switch (type) {
        case -1: // Loss
            this.massLossMult += n * (0.3 + this.getAntiteamMult());
            break;
        case 1: // Gain
            this.massGainMult += n * (0.3 + this.getAntiteamMult());
            break;
    }
};

// Viewing box

PlayerTracker.prototype.getBox = function() { // For view distance
    if (this.cells.length > 0) {
        var totalSize = this.getSizes();
        this.viewScale = Math.sqrt(totalSize) / Math.log(totalSize);
    }

    // Generous view distance multiplier (3.2x) so zoomed-out clients see bots smoothly entering from off-screen
    var mult = (this.viewScale || 1) * 3.2;
    var w = (this.gameServer.config.serverViewBaseX || 2560) * mult,
        h = (this.gameServer.config.serverViewBaseY || 1440) * mult;

    return new Rectangle(
        this.centerPos.x,
        this.centerPos.y,
        w / 2,
        h / 2
    );
};

PlayerTracker.prototype.updateCenter = function() { // Get center of cells
    var len = this.cells.length;

    if (len <= 0) return;

    var X = 0;
    var Y = 0;
    for (var i = 0; i < len; i++) {
        // Error check
        if (!this.cells[i]) {
            len--;
            continue;
        }
        var cell = this.cells[i];

        X += cell.position.x;
        Y += cell.position.y;
    }

    this.centerPos = new Vector(X / len, Y / len);
};

PlayerTracker.prototype.viewReset = function() {
    var ts = process.hrtime();
    if (this.spectate) {
        // Spectate mode
        return this.getSpectateNodes();
    }

    // Update center
    this.updateCenter();

    // Box
    var box = this.getBox();
    var newVisible = this.calcVisibleNodes(box);

    this.gameServer.playerHandler.tPFOV += getTime(process.hrtime(ts));
    return newVisible;
};

PlayerTracker.prototype.cycleSpectateTarget = function() {
    var activePlayers = [];
    for (var i = 0; i < this.gameServer.clients.length; i++) {
        var cl = this.gameServer.clients[i];
        if (cl && cl.playerTracker && cl.playerTracker !== this && cl.playerTracker.cells && cl.playerTracker.cells.length > 0) {
            activePlayers.push(cl.playerTracker);
        }
    }
    if (activePlayers.length === 0) {
        this.specTarget = null;
        return;
    }
    var currentIdx = -1;
    if (this.specTarget) {
        currentIdx = activePlayers.indexOf(this.specTarget);
    }
    var nextIdx = (currentIdx + 1) % activePlayers.length;
    this.specTarget = activePlayers[nextIdx];
    this.updateSpectatePosition();
};

PlayerTracker.prototype.updateSpectatePosition = function() {
    var specPlayer = this.specTarget;

    // Verify currently targeted player is alive with cells
    if (!specPlayer || !specPlayer.cells || specPlayer.cells.length === 0 || specPlayer === this) {
        this.specTarget = null;
        specPlayer = null;

        // 1. Leaderboard Rank 1
        if (this.gameServer.gameMode && this.gameServer.gameMode.rankOne &&
            this.gameServer.gameMode.rankOne.cells && this.gameServer.gameMode.rankOne.cells.length > 0 &&
            this.gameServer.gameMode.rankOne !== this) {
            specPlayer = this.gameServer.gameMode.rankOne;
        }

        // 2. Largest Client
        if (!specPlayer && this.gameServer.largestClient && this.gameServer.largestClient.cells &&
            this.gameServer.largestClient.cells.length > 0 && this.gameServer.largestClient !== this) {
            specPlayer = this.gameServer.largestClient;
        }

        // 3. Any active client with cells sorted by score
        if (!specPlayer) {
            var best = null;
            for (var i = 0; i < this.gameServer.clients.length; i++) {
                var cl = this.gameServer.clients[i];
                if (cl && cl.playerTracker && cl.playerTracker !== this && cl.playerTracker.cells && cl.playerTracker.cells.length > 0) {
                    if (!best || cl.playerTracker.getScore(true) > best.getScore(true)) {
                        best = cl.playerTracker;
                    }
                }
            }
            specPlayer = best;
        }

        this.specTarget = specPlayer;
    }

    if (specPlayer && specPlayer.cells && specPlayer.cells.length > 0) {
        var totalMass = 0;
        var sumX = 0, sumY = 0;
        var totalSize = 0;

        for (var c = 0; c < specPlayer.cells.length; c++) {
            var cell = specPlayer.cells[c];
            if (cell && cell.position) {
                var mass = cell.mass || (cell.size * cell.size / 100) || 10;
                sumX += cell.position.x * mass;
                sumY += cell.position.y * mass;
                totalMass += mass;
                totalSize += cell.size;
            }
        }

        if (totalMass > 0) {
            this.centerPos.x = sumX / totalMass;
            this.centerPos.y = sumY / totalMass;
        }

        var specZoom = Math.pow(Math.min(64 / Math.max(totalSize, 64), 1), 0.4);
        specZoom = Math.max(0.12, Math.min(specZoom, 1.0));
        this.viewScale = 1 / specZoom;

        this.sendPosPacket(specZoom);
    } else {
        var borders = this.gameServer.rangeBorders();
        this.centerPos.x = borders.x;
        this.centerPos.y = borders.y;
        this.sendPosPacket(0.65);
    }
};

PlayerTracker.prototype.updateFreeRoamPosition = function() {
    var dx = this.mouse.x - this.centerPos.x;
    var dy = this.mouse.y - this.centerPos.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 40) {
        var speed = Math.min(dist * 0.12, 65);
        this.centerPos.x += (dx / dist) * speed;
        this.centerPos.y += (dy / dist) * speed;
    }

    this.checkBorderPass();
    this.sendPosPacket(0.65);
};

PlayerTracker.prototype.getSpectateNodes = function() {
    var specZoom = this.freeRoam ? 0.65 : (1 / (this.viewScale || 1.5));
    var halfW = ((this.gameServer.config.serverViewBaseX || 1920) / specZoom) * 1.5;
    var halfH = ((this.gameServer.config.serverViewBaseY || 1080) / specZoom) * 1.5;
    var box = new Rectangle(
        this.centerPos.x,
        this.centerPos.y,
        halfW,
        halfH
    );
    return this.calcVisibleNodes(box);
};

PlayerTracker.prototype.calcVisibleNodes = function(box) {
    return this.gameServer.quadTree.query(box);
};

PlayerTracker.prototype.setCenterPos = function(x, y) {
    this.centerPos.x = x;
    this.centerPos.y = y;
    if (this.freeRoam) this.checkBorderPass();
};

PlayerTracker.prototype.checkBorderPass = function() {
    // A check while in free-roam mode to avoid player going into nothingness
    if (this.centerPos.x < this.gameServer.config.borderLeft) this.centerPos.x = this.gameServer.config.borderLeft;
    if (this.centerPos.x > this.gameServer.config.borderRight) this.centerPos.x = this.gameServer.config.borderRight;
    if (this.centerPos.y < this.gameServer.config.borderTop) this.centerPos.y = this.gameServer.config.borderTop;
    if (this.centerPos.y > this.gameServer.config.borderBottom) this.centerPos.y = this.gameServer.config.borderBottom;
};

PlayerTracker.prototype.sendPosPacket = function(specZoom) {
    this.socket.sendPacket(new Packet.UpdatePosition(
        this.centerPos.x + this.scrambleX,
        this.centerPos.y + this.scrambleY,
        specZoom
    ));
};

PlayerTracker.prototype.sendCustomPosPacket = function(x, y, specZoom) {
    this.socket.sendPacket(new Packet.UpdatePosition(
        x + this.scrambleX,
        y + this.scrambleY,
        specZoom
    ));
};
