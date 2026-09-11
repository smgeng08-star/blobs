var Vector = require('../modules/Vector');
var Rectangle = require('../modules/Rectangle');
var Cell = require('./Cell');

function PlayerCell() {
    Cell.apply(this, Array.prototype.slice.call(arguments));

    this.cellType = 0;
    this.recombineTicks = 0; // Ticks passed after the cell has split
    this.shouldRecombine = false; // Should the cell combine. If true, collision with own cells happens
    this.collisionRestoreTicks = 0; // Ticks left before cell starts checking for collision with client's cells
}

module.exports = PlayerCell;
PlayerCell.prototype = new Cell();

// Main Functions

PlayerCell.prototype.calcMergeTime = function(base) {
    // Check for merging time (1:1 OgarII formula based on size/radius)
    var r = false;
    if (base == 0 || this.owner.mergeOverride) {
        // Instant recombine in config or merge command was triggered for this client
        r = true;
    } else {
        var rec = Math.floor(base + ((0.02 * this.getSize()))); // base seconds (30s) + 0.02 * size
        if (this.recombineTicks > rec) r = true; // Can combine with other cells
    }
    this.shouldRecombine = r;
};

// Movement

PlayerCell.prototype.getSpeed = function() {
    // 1:1 OgarII moveSpeed formula
    return 88 * Math.pow(this.getSize(), -0.4396754) * (this.gameServer.config.playerSpeed / 30);
};

PlayerCell.prototype.getSplittingSpeed = function() {
    return this.gameServer.config.playerSpeed * 2.6 * Math.pow(this.getSize(), 0.0122);
};

PlayerCell.prototype.move = function() {
    // Get angle to mouse
    var cartesian = this.position.clone().sub(this.owner.mouse);
    var distance = cartesian.distance(),
        speed = this.getSpeed();

    if (isNaN(distance) || speed <= 0) return;

    // Move cell
    this.position.sub(cartesian.addDistance(Math.min(distance, speed) - distance));
};

PlayerCell.prototype.eat = function() {
    var rangeSize = this.getSize() + 150;
    var queryBox = new Rectangle(this.position.x, this.position.y, rangeSize, rangeSize);
    var nearby = this.gameServer.quadTree.query(queryBox);

    // Direct check of all player and bot cells
    for (var c = 0; c < this.gameServer.clients.length; c++) {
        var cl = this.gameServer.clients[c];
        if (!cl || cl.fullyDisconnected || !cl.playerTracker) continue;
        var pTracker = cl.playerTracker;
        for (var k = 0; k < pTracker.cells.length; k++) {
            var otherCell = pTracker.cells[k];
            if (!otherCell || otherCell.eaten || otherCell === this) continue;
            if (nearby.indexOf(otherCell) === -1) {
                nearby.push(otherCell);
            }
        }
    }

    var i = nearby.length;
    while (--i > -1) {
        var check = nearby[i];
        if (!check || check.eaten || check === this) continue;

        if (this.gameServer.collisionHandler.canEat(this, check)) {
            check.eaten = true;
            check.onConsume(this);
            check.setKiller(this);
            this.gameServer.removeNode(check);
        }
    }
};

PlayerCell.prototype.onConsume = function(consumer) {
    // Add an inefficiency for eating other players' cells
    var factor = ( consumer.owner === this.owner ? 1 : this.gameServer.config.playerMassAbsorbed );
    // Authentic Agar.io anti-bot mechanic: when mass >= 600, eating cells with mass <= 17 (e.g. 10-13 mass) grants 0 mass
    if (consumer.mass >= 600 && this.mass <= 17) {
        factor = 0;
    }

    // Apply anti-teaming
    if (consumer.owner.pID != this.owner.pID) {
        consumer.owner.applyTeaming(this.mass, 1);
        this.owner.applyTeaming(this.mass, -1);
    }
    consumer.addMass(factor * this.mass);
};

PlayerCell.prototype.onAdd = function(gameServer) {
    // Add to special player node list
    gameServer.nodesPlayer.push(this);
    // Gamemode actions
    gameServer.gameMode.onCellAdd(this);
};

PlayerCell.prototype.onRemove = function(gameServer) {
    var index;
    // Remove from player cell list
    index = this.owner.cells.indexOf(this);
    if (index != -1) {
        this.owner.cells.splice(index, 1);
    }
    // Remove from special player controlled node list
    index = this.gameServer.nodesPlayer.indexOf(this);
    if (index != -1) {
        this.gameServer.nodesPlayer.splice(index, 1);
    }
    // Gamemode actions
    this.gameServer.gameMode.onCellRemove(this);
};

PlayerCell.prototype.addMass = function(n) {
    this.mass += n;

    // In real agar.io, maximum mass of a single cell is capped at playerMaxMass (typically 22,500)
    if (this.mass > this.gameServer.config.playerMaxMass) {
        if (this.owner.cells.length < this.gameServer.config.playerMaxCells) {
            // Autosplit into another cell
            var randomAngle = Math.random() * 6.28;
            this.gameServer.nodeHandler.createPlayerCell(this.owner, this, randomAngle, this.mass / 2);
        } else {
            // Hard cap at max mass when at max cells (cannot exceed 22,500 per cell)
            this.mass = this.gameServer.config.playerMaxMass;
        }
    }
};
