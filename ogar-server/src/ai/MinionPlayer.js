var PlayerTracker = require('../PlayerTracker');
var Vector = require('../modules/Vector');

function MinionPlayer(gameServer, socket, owner, customMass) {
    PlayerTracker.apply(this, [gameServer, socket]);
    this.owner = owner;
    this.isMinion = true;
    this.customMass = (customMass !== undefined && customMass !== null) ? customMass : 10;
    this.splitCooldown = 0;
    this.frozen = false;
    this.collectFood = false;
}

module.exports = MinionPlayer;
MinionPlayer.prototype = Object.create(PlayerTracker.prototype);
MinionPlayer.prototype.constructor = MinionPlayer;

MinionPlayer.prototype.update = function() {
    if (!this.owner || this.owner.fullyDisconnected || this.owner.disconnect > -1) {
        if (this.cells && this.cells.length > 0) {
            for (var cIdx = this.cells.length - 1; cIdx >= 0; cIdx--) {
                this.gameServer.removeNode(this.cells[cIdx]);
            }
            this.cells = [];
        }
        if (this.socket && typeof this.socket.close === 'function') {
            this.socket.close();
        }
        return;
    }
    if (this.owner.cells && this.owner.cells.length === 0 && !this.owner.spectate) {
        return;
    }

    if (this.cells.length <= 0) {
        if (!this.hasUniqueColor) {
            this.setColor(this.gameServer.getRandomColor());
            this.hasUniqueColor = true;
        }
        if (this.owner && this.owner.name) {
            this.setName(this.owner.name);
        }
        if (this.customMass) {
            this.gameServer.spawnPlayer(this, null, this.customMass);
        } else {
            this.gameServer.gameMode.onPlayerSpawn(this.gameServer, this);
        }
        if (this.cells.length === 0) {
            return;
        }
    }

    if (this.splitCooldown > 0) this.splitCooldown--;

    if (this.frozen) {
        var c = this.cells[0];
        if (c) this.mouse = new Vector(c.position.x, c.position.y);
        return;
    }

    if (this.collectFood) {
        this.visibleNodes = this.viewReset();
        var myCell = this.cells[0];
        if (myCell) {
            var nearestFood = null;
            var minDist = Infinity;
            for (var i = 0; i < this.visibleNodes.length; i++) {
                var node = this.visibleNodes[i];
                if (node && node.cellType === 1) {
                    var d = Math.hypot(node.position.x - myCell.position.x, node.position.y - myCell.position.y);
                    if (d < minDist) {
                        minDist = d;
                        nearestFood = node;
                    }
                }
            }
            if (nearestFood) {
                this.mouse = new Vector(nearestFood.position.x, nearestFood.position.y);
                return;
            }
        }
    }

    if (this.owner.mouse) {
        this.mouse = new Vector(this.owner.mouse.x, this.owner.mouse.y);
    } else if (this.owner.centerPos) {
        this.mouse = new Vector(this.owner.centerPos.x, this.owner.centerPos.y);
    }
};
