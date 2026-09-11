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

    // In Agar.io, eating a virus adds the virus's mass to the consumer
    consumer.addMass(this.mass);

    // Max pieces a player can have is 16
    var maxCells = this.gameServer.config.playerMaxCells || 16;
    var currentCells = client.cells.length;

    // If player already has max cells (16), virus is simply absorbed without popping
    if (currentCells >= maxCells) {
        return;
    }

    // Determine how many splits can be performed up to maxCells
    var maxSplits = maxCells - currentCells;
    var totalMass = consumer.mass;

    // In authentic Agar.io, determine piece count based on cell mass
    var pieces = Math.min(maxSplits, Math.max(1, Math.floor(totalMass / 25)));
    if (pieces <= 0) return;

    // In authentic Agar.io:
    // The original main cell keeps the majority of mass in the center,
    // while a cloud of varying smaller pieces (~14 to 32 mass) are launched outward radially.
    var angleStep = (Math.PI * 2) / pieces;
    var baseAngle = Math.random() * Math.PI * 2;

    for (var i = 0; i < pieces; i++) {
        if (client.cells.length >= maxCells) break;
        if (consumer.mass < this.gameServer.config.playerMinMassSplit) break;

        // Realistic variation for each popped piece (authentic Agar.io feel)
        var pieceMass = Math.max(12, Math.floor(Math.min(consumer.mass * 0.12, 16 + (Math.random() * 16))));
        if (consumer.mass <= pieceMass + 15) break;

        var angle = baseAngle + (i * angleStep) + (Math.random() * 0.2 - 0.1);
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
    // Set shooting angle in direction of incoming mass
    if (node.moveEngine && node.moveEngine.distanceSq() > 1) {
        this.shootAngle = node.moveEngine.angle();
    } else {
        this.shootAngle = node.position.angleTo(this.position);
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
