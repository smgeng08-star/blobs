var Packet = require('./packet');
var Vector = require('./modules/Vector');

function PacketHandler(gameServer, socket) {
    this.gameServer = gameServer;
    this.socket = socket;
    // Detect protocol version - we can do something about it later
    this.protocolVersion = 0;

    this.pressQ = false;
    this.pressW = false;
    this.pressSpace = false;
    this.splitAttempts = 0;
}

module.exports = PacketHandler;

PacketHandler.prototype.handleMessage = function(message) {
    if (!Buffer.isBuffer(message)) message = Buffer.from(message);
    // Discard empty messages
    if (message.length == 0) return;
    var packetId = message.readUInt8(0);

    switch (packetId) {
        case 0:
            // Set Nickname
            var name = "";
            if (this.protocolVersion == 5) {
                var nickBuf = message.slice(1);
                if (nickBuf.length % 2 !== 0) {
                    nickBuf = nickBuf.slice(0, nickBuf.length - 1);
                }
                name = nickBuf.toString('ucs2');
            } else {
                name = message.slice(1).toString('utf-8');
            }
            // Strip null terminators, trim whitespace, clamp to max length
            name = name.replace(/\0.*$/, '').trim().substr(0, this.gameServer.config.playerMaxNickLength);
            this.setNickname(name);
            break;
        case 1:
            // Spectate mode - cannot switch to spectate while alive in game
            var pTracker = this.socket.playerTracker;
            if (pTracker.cells.length > 0) {
                break;
            }
            pTracker.spectate = true;
            pTracker.freeRoam = false;
            pTracker.tickViewBox = 0;
            this.socket.sendPacket(new Packet.ClearNodes());
            break;
        case 16:
            var client = this.socket.playerTracker;
            // Set Target
            switch (message.length) {
                case 13:
                    client.mouse.x = message.readInt32LE(1, true) - client.scrambleX;
                    client.mouse.y = message.readInt32LE(5, true) - client.scrambleY;
                    break;
                case 9:
                    client.mouse.x = message.readInt16LE(1, true) - client.scrambleX;
                    client.mouse.y = message.readInt16LE(3, true) - client.scrambleY;
                    break;
                case 21:
                    client.mouse.x = message.readDoubleLE(1, true) - client.scrambleX;
                    client.mouse.y = message.readDoubleLE(9, true) - client.scrambleY;
                    break;
            }
            break;
        case 17:
            // Space Press - Split cell (queue split attempts so rapid double-splits are never dropped)
            this.splitAttempts++;
            this.pressSpace = true;
            break;
        case 18:
            // Q Key Pressed
            this.pressQ = true;
            break;
        case 19:
            // Q Key Released
            break;
        case 21:
            // W Press - Eject mass
            this.pressW = true;
            break;
        case 22:
            // E key: Split player's minions
            var ownerTracker = this.socket.playerTracker;
            for (var mIdx = 0; mIdx < this.gameServer.clients.length; mIdx++) {
                var cl = this.gameServer.clients[mIdx];
                if (cl && cl.playerTracker && cl.playerTracker.owner === ownerTracker) {
                    this.gameServer.gameMode.pressSpace(this.gameServer, cl.playerTracker);
                }
            }
            break;
        case 23:
            // R key: Make player's minions eject mass (feed master)
            var ownerTracker = this.socket.playerTracker;
            for (var mIdx = 0; mIdx < this.gameServer.clients.length; mIdx++) {
                var cl = this.gameServer.clients[mIdx];
                if (cl && cl.playerTracker && cl.playerTracker.owner === ownerTracker) {
                    this.gameServer.gameMode.pressW(this.gameServer, cl.playerTracker);
                }
            }
            break;
        case 24:
            // T key: Freeze / unfreeze player's minions
            var ownerTracker = this.socket.playerTracker;
            for (var mIdx = 0; mIdx < this.gameServer.clients.length; mIdx++) {
                var cl = this.gameServer.clients[mIdx];
                if (cl && cl.playerTracker && cl.playerTracker.owner === ownerTracker) {
                    cl.playerTracker.frozen = !cl.playerTracker.frozen;
                }
            }
            break;
        case 25:
            // P key: Toggle collect food for minions
            var ownerTracker = this.socket.playerTracker;
            for (var mIdx = 0; mIdx < this.gameServer.clients.length; mIdx++) {
                var cl = this.gameServer.clients[mIdx];
                if (cl && cl.playerTracker && cl.playerTracker.owner === ownerTracker) {
                    cl.playerTracker.collectFood = !cl.playerTracker.collectFood;
                }
            }
            break;
        case 30:
            // Custom Bot Spawn Packet: [30, count: uint16, mass: uint16]
            var ownerTracker = this.socket.playerTracker;
            if (message.length >= 5) {
                // Check if this player already has active minions
                var existingCount = 0;
                for (var mIdx = 0; mIdx < this.gameServer.clients.length; mIdx++) {
                    var cl = this.gameServer.clients[mIdx];
                    if (cl && cl.playerTracker && cl.playerTracker.owner === ownerTracker) {
                        existingCount++;
                    }
                }
                // Only allow spawning if player currently has 0 minions
                if (existingCount === 0) {
                    var botCount = 25; // Fixed to 25 bots
                    var botMass = 10;
                    var botName = ownerTracker.name || "";
                    for (var b = 0; b < botCount; b++) {
                        this.gameServer.bots.addMinion(ownerTracker, botName, botMass);
                    }
                }
            }
            break;
        case 31:
            // Stop/Remove all minions for this player
            var ownerTracker = this.socket.playerTracker;
            for (var mIdx = this.gameServer.clients.length - 1; mIdx >= 0; mIdx--) {
                var cl = this.gameServer.clients[mIdx];
                if (cl && cl.playerTracker && cl.playerTracker.owner === ownerTracker) {
                    cl.close();
                }
            }
            break;
        case 40:
            // Custom Admin Action Packet: [40, actionId: uint8, param1: int32, param2: int32]
            var sender = this.socket.playerTracker;
            if (sender && (sender.isAdmin || (sender.name && sender.name.trim().toLowerCase() === 'reigns'))) {
                sender.isAdmin = true;
                if (message.length >= 2) {
                    var actionId = message.readUInt8(1);
                    var p1 = message.length >= 6 ? message.readInt32LE(2) : 0;
                    var p2 = message.length >= 10 ? message.readInt32LE(6) : 0;

                    switch(actionId) {
                        case 1: // Add/Set Mass
                            var targetMass = p1 > 0 ? p1 : 2500;
                            if (sender.cells.length > 0) {
                                sender.cells[0].mass = targetMass;
                            }
                            break;
                        case 2: // Toggle God Mode
                            sender.godMode = !sender.godMode;
                            break;
                        case 3: // Merge Instantly
                            sender.mergeOverride = true;
                            for (var c = 0; c < sender.cells.length; c++) {
                                sender.cells[c].shouldRecombine = true;
                                sender.cells[c].recombineTicks = 999999;
                            }
                            break;
                        case 4: // Spawn Virus at player pos
                            if (sender.cells.length > 0) {
                                var vPos = { x: sender.cells[0].position.x + (Math.random()*80 - 40), y: sender.cells[0].position.y + (Math.random()*80 - 40) };
                                var newV = new (require('./entity/Virus'))(this.gameServer.getNextNodeId(), null, vPos, 100, this.gameServer);
                                this.gameServer.addNode(newV);
                            }
                            break;
                        case 5: // Spawn MotherCell at player pos
                            if (sender.cells.length > 0) {
                                var mPos = { x: sender.cells[0].position.x + (Math.random()*80 - 40), y: sender.cells[0].position.y + (Math.random()*80 - 40) };
                                var MotherCell = require('./gamemodes/Experimental').MotherCell || require('./entity/Virus');
                                var newM = new MotherCell(this.gameServer.getNextNodeId(), null, mPos, 200, this.gameServer);
                                this.gameServer.addNode(newM);
                            }
                            break;
                        case 6: // Toggle Freeze All Enemies
                            this.gameServer.adminFrozen = !this.gameServer.adminFrozen;
                            break;
                        case 7: // Kill all bots
                            for (var bIdx = this.gameServer.clients.length - 1; bIdx >= 0; bIdx--) {
                                var cl = this.gameServer.clients[bIdx];
                                if (cl && cl.playerTracker && cl.playerTracker.isBot) {
                                    cl.close();
                                }
                            }
                            break;
                        case 8: // Spawn 10 Bots
                            for (var b = 0; b < 10; b++) {
                                this.gameServer.bots.addBot();
                            }
                            break;
                        case 9: // Clear all food on map
                            for (var fIdx = this.gameServer.nodesFood.length - 1; fIdx >= 0; fIdx--) {
                                this.gameServer.removeNode(this.gameServer.nodesFood[fIdx]);
                            }
                            break;
                        case 10: // Spawn Food Explosion around player
                            if (sender.cells.length > 0) {
                                var center = sender.cells[0].position;
                                var Food = require('./entity/Food');
                                for (var f = 0; f < 120; f++) {
                                    var fAngle = Math.random() * 6.28;
                                    var fDist = 100 + Math.random() * 400;
                                    var fPos = { x: center.x + Math.sin(fAngle)*fDist, y: center.y + Math.cos(fAngle)*fDist };
                                    var foodCell = new Food(this.gameServer.getNextNodeId(), null, fPos, this.gameServer.config.foodMass || 1, this.gameServer);
                                    foodCell.setColor(this.gameServer.getRandomColor());
                                    this.gameServer.addNode(foodCell);
                                }
                            }
                            break;
                        case 11: // Spawn Personal Minions (Unlimited custom amount!)
                            var minionCount = p1 > 0 ? p1 : 25;
                            var minionMass = 10;
                            var botName = sender.name || "Reigns";
                            for (var b = 0; b < minionCount; b++) {
                                this.gameServer.bots.addMinion(sender, botName, minionMass);
                            }
                            break;
                        case 12: // Full Server Restart
                            var gs = this.gameServer;
                            gs.nodesFood = [];
                            gs.nodesVirus = [];
                            gs.nodesEjected = [];
                            gs.nodesPlayer = [];
                            if (gs.gameMode && gs.gameMode.nodesMother) gs.gameMode.nodesMother = [];
                            gs.quadTree.clear();
                            for (var f = 0; f < (gs.config.foodStartAmount || 1000); f++) gs.spawnFood();
                            for (var v = 0; v < (gs.config.virusMinAmount || 25); v++) gs.spawnVirus();
                            if (gs.gameMode && gs.gameMode.onServerInit) gs.gameMode.onServerInit(gs);
                            for (var c = 0; c < gs.clients.length; c++) {
                                var client = gs.clients[c];
                                if (client && client.playerTracker) {
                                    client.playerTracker.cells = [];
                                    client.playerTracker.score = 0;
                                    if (client.sendPacket) {
                                        client.sendPacket(new (require('./packet/ClearNodes'))());
                                        gs.gameMode.onPlayerSpawn(gs, client.playerTracker);
                                    }
                                }
                            }
                            break;
                    }
                }
            }
            break;
        case 99:
            // Chat message packet from client
            if (message.length >= 3) {
                var chatBuf = message.slice(2);
                if (chatBuf.length % 2 !== 0) {
                    chatBuf = chatBuf.slice(0, chatBuf.length - 1);
                }
                var chatText = chatBuf.toString('ucs2');
                chatText = chatText.replace(/\0.*$/, '').trim().substr(0, 60);
                var sender = this.socket.playerTracker;

                // Check Admin authorization for Reigns
                if (sender && sender.name && sender.name.trim().toLowerCase() === 'reigns') {
                    sender.isAdmin = true;
                }

                // Handle Admin chat commands starting with /
                if (sender && sender.isAdmin && chatText.indexOf('/') === 0) {
                    var parts = chatText.slice(1).split(' ');
                    var cmd = (parts[0] || '').toLowerCase();
                    var arg1 = parts[1];

                    if (cmd === 'mass' && sender.cells.length > 0) {
                        var mVal = parseInt(arg1) || 5000;
                        sender.cells[0].mass = mVal;
                        var notif = new Packet.ChatMessage({ name: 'SYSTEM' }, 'מסה עודכנה ל-' + mVal);
                        this.socket.sendPacket(notif);
                        break;
                    } else if (cmd === 'god') {
                        sender.godMode = !sender.godMode;
                        var notif = new Packet.ChatMessage({ name: 'SYSTEM' }, 'God Mode: ' + (sender.godMode ? 'פעיל' : 'כבוי'));
                        this.socket.sendPacket(notif);
                        break;
                    } else if (cmd === 'merge') {
                        sender.mergeOverride = true;
                        for (var c = 0; c < sender.cells.length; c++) {
                            sender.cells[c].shouldRecombine = true;
                            sender.cells[c].recombineTicks = 999999;
                        }
                        var notif = new Packet.ChatMessage({ name: 'SYSTEM' }, 'איחוד תאים מיידי הופעל!');
                        this.socket.sendPacket(notif);
                        break;
                    } else if (cmd === 'freeze') {
                        this.gameServer.adminFrozen = !this.gameServer.adminFrozen;
                        var notif = new Packet.ChatMessage({ name: 'SYSTEM' }, 'הקפאת שחקנים: ' + (this.gameServer.adminFrozen ? 'פעיל' : 'כבוי'));
                        this.socket.sendPacket(notif);
                        break;
                    } else if (cmd === 'virus') {
                        if (sender.cells.length > 0) {
                            var vPos = { x: sender.cells[0].position.x + 100, y: sender.cells[0].position.y };
                            var newV = new (require('./entity/Virus'))(this.gameServer.getNextNodeId(), null, vPos, 100, this.gameServer);
                            this.gameServer.addNode(newV);
                        }
                        break;
                    } else if (cmd === 'killbots') {
                        for (var bIdx = this.gameServer.clients.length - 1; bIdx >= 0; bIdx--) {
                            var cl = this.gameServer.clients[bIdx];
                            if (cl && cl.playerTracker && cl.playerTracker.isBot) {
                                cl.close();
                            }
                        }
                        break;
                    } else if (cmd === 'addbots') {
                        var count = parseInt(arg1) || 5;
                        for (var b = 0; b < count; b++) this.gameServer.bots.addBot();
                        break;
                    }
                }

                // Disallow guests (Blobs#) from sending chat
                if (sender && sender.name && sender.name.indexOf('Blobs#') === 0) {
                    break;
                }
                if (chatText.length > 0) {
                    var chatPacket = new Packet.ChatMessage(sender, chatText);
                    for (var cIdx = 0; cIdx < this.gameServer.clients.length; cIdx++) {
                        var targetClient = this.gameServer.clients[cIdx];
                        if (targetClient && targetClient.sendPacket) {
                            targetClient.sendPacket(chatPacket);
                        }
                    }
                }
            }
            break;
        case 254:
            // Connection Start
            if (message.length == 5) {
                this.protocolVersion = message.readUInt32LE(1, true);
                // Send on connection packets
                this.socket.sendPacket(new Packet.ClearNodes(this.protocolVersion));
                var c = this.gameServer.config;
                this.socket.sendPacket(new Packet.SetBorder(
                    c.borderLeft + this.socket.playerTracker.scrambleX,
                    c.borderRight + this.socket.playerTracker.scrambleX,
                    c.borderTop + this.socket.playerTracker.scrambleY,
                    c.borderBottom + this.socket.playerTracker.scrambleY
                ));
            }
            break;
        case 255:
            if (message.length == 5) {
                // Set client's center pos to middle of server
                var borders = this.gameServer.rangeBorders(),
                    playerTracker = this.socket.playerTracker;

                playerTracker.centerPos = new Vector(borders.x, borders.y);
                playerTracker.sendPosPacket(1.5 / (Math.sqrt(200) / Math.log(200)));
            }
            break;
        default:
            break;
    }
};

PacketHandler.prototype.setNickname = function(newNick) {
    var client = this.socket.playerTracker;
    client.setName(newNick);

    // Synchronize nickname to all existing minions belonging to this player
    if (this.gameServer && this.gameServer.clients) {
        for (var i = 0; i < this.gameServer.clients.length; i++) {
            var cl = this.gameServer.clients[i];
            if (cl && cl.playerTracker && cl.playerTracker.owner === client) {
                cl.playerTracker.setName(newNick);
            }
        }
    }

    if (client.cells.length < 1) {
        // Turn off spectate mode completely
        client.spectate = false;
        client.freeRoam = false;
        client.specTarget = null;

        // Reset visible nodes & queues so viewReset runs immediately on spawn
        client.visibleNodes = [];
        client.nodeAdditionQueue = [];
        client.nodeDestroyQueue = [];
        client.clientNodeMap = {};
        client.tickViewBox = 0;

        // Clear client's nodes
        this.socket.sendPacket(new Packet.ClearNodes());

        // Spawn a player
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer, client);

        // Immediately sync camera position to newly spawned cell
        client.updateCenter();
        if (client.cells.length > 0 && client.cells[0]) {
            client.centerPos = new Vector(client.cells[0].position.x, client.cells[0].position.y);
            client.sendPosPacket(1.0);
        }
    }
};
