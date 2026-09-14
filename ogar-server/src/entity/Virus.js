var Cell = require('./Cell');

function Virus() {
    Cell.apply(this, Array.prototype.slice.call(arguments));

    this.color = {
        r: 51,
        g: 255,
        b: 51
    };
    this.cellType = 2;
    this.spiked = 1;
    this.fed = 0;
    this.isMotherCell = false; // Not to confuse bots
}

module.exports = Virus;
Virus.prototype = new Cell();

// Main functions

Virus.prototype.onConsume = function(consumer) {
    var client = consumer.owner;

    // Add mass from virus
    consumer.addMass(this.mass);

    var maxCells = this.gameServer.config.playerMaxCells || 16;
    var cellsLeft = maxCells - client.cells.length;
    if (cellsLeft <= 0) return;

    var splitMin = this.gameServer.config.playerMinMassSplit || 36;
    var cellMass = consumer.mass;

    // 1:1 OgarII distributeCellMass algorithm
    var splits = [];
    if (cellMass / cellsLeft < splitMin) {
        var amount = 2,
            perPiece = NaN;
        while (
            (perPiece = cellMass / (amount + 1)) >= splitMin &&
            amount * 2 <= cellsLeft
        ) {
            amount *= 2;
        }
        for (var i = 0; i < amount; i++) splits.push(perPiece);
    } else {
        var nextMass = cellMass / 2;
        var massLeft = cellMass / 2;
        while (cellsLeft > 0) {
            if (nextMass / cellsLeft < splitMin) break;
            while (nextMass >= massLeft && cellsLeft > 1) nextMass /= 2;
            splits.push(nextMass);
            massLeft -= nextMass;
            cellsLeft--;
        }
        nextMass = massLeft / cellsLeft;
        for (var i = 0; i < cellsLeft; i++) splits.push(nextMass);
    }

    // Launch pieces with explosive boost in 360 starburst
    for (var i = 0; i < splits.length; i++) {
        if (client.cells.length >= maxCells) break;
        var pieceMass = Math.max(10, Math.floor(splits[i]));
        if (consumer.mass <= pieceMass + 10) break;

        var angle = Math.random() * 2 * Math.PI;
        this.gameServer.nodeHandler.createPlayerCell(client, consumer, angle, pieceMass);
    }
};

Virus.prototype.eat = function() {
    // Maximum amount of viruses
    if (this.gameServer.nodesVirus.length >= this.gameServer.config.virusMaxAmount) return;

    // Virus eats ejected cells
    var nearby = this.gameServer.quadTree.query(this.getRange(), function(node) {
        return node.cellType == 3;
    });

    for (var i = 0; i < nearby.length; i++) {
        var node = nearby[i];
        if (!node) continue;

        var dist = this.position.sqDistanceTo(node.position);
        var maxDist = this.getSquareSize();

        if (dist < maxDist) this.feed(node);
    }
};

Virus.prototype.feed = function(node) {
    // Eat it
    node.inRange = true;
    node.setKiller(this);
    this.gameServer.removeNode(node);

    // On feed checks
    this.fed++;
    this.mass += node.mass;

    // Save the travel direction of the incoming mass (moving from player into virus, continuing forward)
    if (node.moveEngine && node.moveEngine.distanceSq() > 1) {
        this.shootAngle = Math.atan2(-node.moveEngine.x, -node.moveEngine.y);
    } else {
        var dx = this.position.x - node.position.x;
        var dy = this.position.y - node.position.y;
        this.shootAngle = Math.atan2(dx, dy);
    }

    if (this.fed >= this.gameServer.config.virusFeedAmount) {
        // Shoot!
        this.mass = this.gameServer.config.virusStartMass;
        this.fed = 0;

        this.gameServer.nodeHandler.shootVirus(this);
    }
};

Virus.prototype.onAdd = function() {
    this.gameServer.nodesVirus.push(this);
};

Virus.prototype.onRemove = function() {
    var index = this.gameServer.nodesVirus.indexOf(this);
    if (index != -1) this.gameServer.nodesVirus.splice(index, 1);
};
