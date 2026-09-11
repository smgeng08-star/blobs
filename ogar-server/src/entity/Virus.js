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
    var maxCells = this.gameServer.config.playerMaxCells;
    var currentCells = client.cells.length;

    // If player already has max cells (16), virus is simply absorbed without popping
    if (currentCells >= maxCells) {
        return;
    }

    var splitsNeeded = maxCells - currentCells;
    if (splitsNeeded <= 0) return;

    // Determine how many pieces to explode into
    var totalMass = consumer.mass;
    var pieces = Math.min(splitsNeeded, Math.floor(totalMass / 20));
    if (pieces < 1) pieces = 1;

    // In authentic Agar.io, virus splits the cell into multiple equal small pieces ejected outward
    var splitMass = Math.max(10, Math.floor((totalMass * 0.45) / pieces));
    var angleStep = (2 * Math.PI) / pieces;
    var baseAngle = Math.random() * Math.PI * 2;

    for (var i = 0; i < pieces; i++) {
        if (client.cells.length >= maxCells) break;
        if (consumer.mass < this.gameServer.config.playerMinMassSplit || consumer.mass <= splitMass) break;

        var angle = baseAngle + (i * angleStep) + (Math.random() * 0.4 - 0.2);
        this.gameServer.nodeHandler.createPlayerCell(client, consumer, angle, splitMass);
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
