var PlayerTracker = require('../PlayerTracker');
var gameServer = require('../GameServer');
var Vector = require('../modules/Vector');

function BotPlayer() {
    PlayerTracker.apply(this, Array.prototype.slice.call(arguments));
    this.isBot = true;
    this.splitCooldown = 0;
    this.currentHeading = Math.random() * Math.PI * 2;
    this.targetHeading = this.currentHeading;
    this.targetPos = null;
    this.targetLockTicks = 0;
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderTicks = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.stuckTicks = 0;
}

module.exports = BotPlayer;
BotPlayer.prototype = new PlayerTracker();

// Functions

BotPlayer.prototype.getLowestCell = function() {
    if (this.cells.length <= 0) return null;
    var sorted = this.cells.valueOf();
    sorted.sort(function(a, b) {
        return b.mass - a.mass;
    });
    return sorted[0];
};

BotPlayer.prototype.getLargestCell = function() {
    if (!this.cells || this.cells.length === 0) return null;
    var best = this.cells[0];
    for (var i = 1; i < this.cells.length; i++) {
        if (this.cells[i] && this.cells[i].mass > best.mass) {
            best = this.cells[i];
        }
    }
    return best;
};

BotPlayer.prototype.update = function() {
    for (var i = 0; i < this.nodeDestroyQueue.length; i++) {
        var index = this.visibleNodes.indexOf(this.nodeDestroyQueue[i]);
        if (index > -1) {
            this.visibleNodes.splice(index, 1);
        }
    }

    // Respawn if bot is dead
    if (this.cells.length <= 0) {
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer, this);
        if (this.cells.length == 0) {
            this.socket.close();
            return;
        }
    }
    
    if (this.splitCooldown > 0) this.splitCooldown--;
    
    this.aiTick = (this.aiTick || 0) + 1;
    if (this.aiTick % 2 === 0 || !this.visibleNodes || this.visibleNodes.length === 0) {
        // Update center so viewReset is positioned on current bot
        this.updateCenter();
        this.visibleNodes = this.viewReset();

        var cell = this.getLowestCell();
        if (cell) {
            this.decide(cell);
        }
    }

    this.nodeDestroyQueue = [];
    this.nodeAdditionQueue = [];
};

BotPlayer.prototype.decide = function(cell) {
    if (!cell || !cell.position) return;
    
    var cellPos = cell.position;
    var cellSize = cell.getSize();
    var borders = this.gameServer.borders();

    // Check stuck
    var moveDistSq = (cellPos.x - this.lastX) * (cellPos.x - this.lastX) + (cellPos.y - this.lastY) * (cellPos.y - this.lastY);
    if (moveDistSq < 6) {
        this.stuckTicks++;
    } else {
        this.stuckTicks = 0;
    }
    this.lastX = cellPos.x;
    this.lastY = cellPos.y;

    var threats = [];
    var preys = [];
    var foodNodes = [];
    var virusThreats = [];

    // Scan visible entities
    for (var i = 0; i < this.visibleNodes.length; i++) {
        var node = this.visibleNodes[i];
        if (!node || node.owner === cell.owner) continue;

        if (node.cellType === 0) {
            // Player cells
            if (this.gameServer.gameMode.haveTeams && (cell.owner.team === node.owner.team)) continue;

            if (node.mass > cell.mass * 1.12) {
                threats.push(node);
            } else if (cell.mass > node.mass * 1.25 && node.mass >= 15) {
                preys.push(node);
            }
        } else if (node.cellType === 1 || node.cellType === 3) {
            // Food / Ejected Mass
            foodNodes.push(node);
        } else if (node.cellType === 2) {
            // Virus / Mothercell
            if (node.isMotherCell) {
                if (cell.mass < node.mass * 1.15) {
                    virusThreats.push({ node: node, safeDist: node.getSize() + cellSize + 60 });
                }
            } else if (cell.mass > 115 && this.cells.length < this.gameServer.config.playerMaxCells) {
                virusThreats.push({ node: node, safeDist: node.getSize() + cellSize + 50 });
            }
        }
    }

    // Defensive Panic Split if large enemy is charging in close
    if (cell.mass >= 45 && this.splitCooldown === 0 && this.cells.length < 8) {
        for (var t = 0; t < threats.length; t++) {
            var threat = threats[t];
            var dx = threat.position.x - cellPos.x;
            var dy = threat.position.y - cellPos.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var dangerDist = (threat.getSize() + cellSize) * 1.6;

            if (dist < dangerDist) {
                var escapeAngle = Math.atan2(-dy, -dx);
                this.mouse = new Vector(
                    cellPos.x + Math.cos(escapeAngle) * 2000,
                    cellPos.y + Math.sin(escapeAngle) * 2000
                );
                this.currentHeading = escapeAngle;
                this.targetHeading = escapeAngle;
                this.splitCooldown = 25;
                this.gameServer.nodeHandler.splitCells(this);
                return;
            }
        }
    }

    var desiredDirX = 0;
    var desiredDirY = 0;
    var isEmergency = false;

    // 1. PRIORITY: FLEE FROM PREDATORS
    if (threats.length > 0) {
        var fleeX = 0, fleeY = 0, highestThreat = 0;
        for (var t = 0; t < threats.length; t++) {
            var threat = threats[t];
            var tdx = cellPos.x - threat.position.x;
            var tdy = cellPos.y - threat.position.y;
            var tdist = Math.sqrt(tdx * tdx + tdy * tdy);
            var dangerRadius = threat.getSize() * 3.8 + cellSize;
            if (tdist < dangerRadius && tdist > 1) {
                var weight = (dangerRadius - tdist) / dangerRadius;
                fleeX += (tdx / tdist) * weight * 15;
                fleeY += (tdy / tdist) * weight * 15;
                highestThreat = Math.max(highestThreat, weight);
            }
        }
        if (highestThreat > 0.05) {
            desiredDirX = fleeX;
            desiredDirY = fleeY;
            isEmergency = true;
            this.targetPos = null;
        }
    }

    // 2. PRIORITY: HUNT PREY & SPLITKILL
    if (!isEmergency && preys.length > 0) {
        // Find closest / highest value prey
        var bestPrey = null;
        var bestScore = -Infinity;

        for (var p = 0; p < preys.length; p++) {
            var pr = preys[p];
            var pdx = pr.position.x - cellPos.x;
            var pdy = pr.position.y - cellPos.y;
            var pdist = Math.sqrt(pdx * pdx + pdy * pdy);
            var score = pr.mass / (pdist + 50);
            if (score > bestScore) {
                bestScore = score;
                bestPrey = pr;
            }
        }

        if (bestPrey) {
            var pdx = bestPrey.position.x - cellPos.x;
            var pdy = bestPrey.position.y - cellPos.y;
            var pdist = Math.sqrt(pdx * pdx + pdy * pdy);

            // Check Splitkill
            if (cell.mass >= 70 && this.splitCooldown === 0 && this.cells.length < 4) {
                var halfMass = cell.mass / 2;
                if (halfMass > bestPrey.mass * 1.25) {
                    var maxSplitDist = this.splitDistance(cell);
                    var minSplitDist = (cellSize + bestPrey.getSize()) * 0.4;
                    if (pdist < maxSplitDist && pdist > minSplitDist) {
                        this.mouse = new Vector(bestPrey.position.x, bestPrey.position.y);
                        this.splitCooldown = 30;
                        this.gameServer.nodeHandler.splitCells(this);
                        return;
                    }
                }
            }

            desiredDirX = pdx;
            desiredDirY = pdy;
            this.targetPos = bestPrey.position;
        }
    }

    // 3. PRIORITY: FARMING FOOD (Smooth lock on nearest / densest cluster)
    if (!isEmergency && (!this.targetPos || this.targetLockTicks <= 0 || !this.targetPos.isAlive)) {
        if (foodNodes.length > 0) {
            var nearestFood = null;
            var minDistSq = Infinity;

            for (var f = 0; f < foodNodes.length; f++) {
                var food = foodNodes[f];
                var fdx = food.position.x - cellPos.x;
                var fdy = food.position.y - cellPos.y;
                var distSq = fdx * fdx + fdy * fdy;
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    nearestFood = food;
                }
            }

            if (nearestFood) {
                this.targetPos = nearestFood.position;
                this.targetLockTicks = 12; // Lock target for 12 ticks so bot rushes straight into it
                desiredDirX = nearestFood.position.x - cellPos.x;
                desiredDirY = nearestFood.position.y - cellPos.y;
            }
        }
    } else if (!isEmergency && this.targetPos) {
        this.targetLockTicks--;
        desiredDirX = this.targetPos.x - cellPos.x;
        desiredDirY = this.targetPos.y - cellPos.y;
        var distToTarget = Math.sqrt(desiredDirX * desiredDirX + desiredDirY * desiredDirY);
        if (distToTarget < 30) {
            this.targetPos = null; // Reached target
        }
    }

    // 4. AVOID VIRUSES IF LARGE
    for (var v = 0; v < virusThreats.length; v++) {
        var vt = virusThreats[v];
        var vdx = cellPos.x - vt.node.position.x;
        var vdy = cellPos.y - vt.node.position.y;
        var vdist = Math.sqrt(vdx * vdx + vdy * vdy);
        if (vdist < vt.safeDist && vdist > 1) {
            var vWeight = ((vt.safeDist - vdist) / vt.safeDist) * 12;
            desiredDirX += (vdx / vdist) * vWeight;
            desiredDirY += (vdy / vdist) * vWeight;
        }
    }

    // 5. CRUISE WANDERING & BORDER REBOUND
    this.wanderTicks++;
    if (this.wanderTicks > 35 || this.stuckTicks > 4) {
        this.wanderTicks = 0;
        this.wanderAngle += (Math.random() - 0.5) * 1.5 + (this.stuckTicks > 4 ? Math.PI * 0.75 : 0);
    }

    var wanderMagnitude = isEmergency ? 0 : 0.6;
    desiredDirX += Math.cos(this.wanderAngle) * wanderMagnitude;
    desiredDirY += Math.sin(this.wanderAngle) * wanderMagnitude;

    // Border push
    var margin = cellSize + 150;
    if (cellPos.x - margin < borders.left) desiredDirX += 8.0;
    if (cellPos.x + margin > borders.right) desiredDirX -= 8.0;
    if (cellPos.y - margin < borders.top) desiredDirY += 8.0;
    if (cellPos.y + margin > borders.bottom) desiredDirY -= 8.0;

    // Compute target angle
    var rawAngle = Math.atan2(desiredDirY, desiredDirX);
    if (!isFinite(rawAngle)) rawAngle = this.wanderAngle;
    this.targetHeading = rawAngle;

    // Smooth heading interpolation (Removes any jitter/oscillation)
    var diff = this.targetHeading - this.currentHeading;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    var turnRate = isEmergency ? 0.45 : 0.28;
    this.currentHeading += diff * turnRate;

    // Output clean virtual mouse 2000px ahead in heading direction
    this.mouse = new Vector(
        cellPos.x + Math.cos(this.currentHeading) * 2000,
        cellPos.y + Math.sin(this.currentHeading) * 2000
    );
};

BotPlayer.prototype.splitDistance = function(cell) {
    var mass = cell.mass;
    var t = Math.PI * Math.PI;
    var modifier = 3 + Math.log(1 + mass) / 10;
    var splitSpeed = cell.owner.gameServer.config.playerSpeed * Math.min(Math.pow(mass, -Math.PI / t / 10) * modifier, 150);
    return Math.max(splitSpeed * 11.5, cell.getSize() * 3);
};

BotPlayer.prototype.largest = function(list) {
    var sorted = list.valueOf();
    sorted.sort(function(a, b) {
        return b.mass - a.mass;
    });
    return sorted[0];
};

BotPlayer.prototype.splitDistance = function(cell) {
    var mass = cell.mass;
    var t = Math.PI * Math.PI;
    var modifier = 3 + Math.log(1 + mass) / 10;
    var splitSpeed = cell.owner.gameServer.config.playerSpeed * Math.min(Math.pow(mass, -Math.PI / t / 10) * modifier, 150);
    return Math.max(splitSpeed * 11.5, cell.getSize() * 3);
};
