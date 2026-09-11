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

    // In Agar.io, eating a virus adds the virus's mass to the specific consumer cell
    consumer.addMass(this.mass);

    // Max pieces a player can have is 16
    var maxCells = this.gameServer.config.playerMaxCells || 16;
    if (client.cells.length >= maxCells) {
        return;
    }

    // Determine how many pieces can be spawned up to maxCells
    var splitsNeeded = maxCells - client.cells.length;
    if (splitsNeeded <= 0) return;

    var totalMass = consumer.mass;
    var minSplit = this.gameServer.config.playerMinMassSplit || 36;
    if (totalMass < minSplit) return;

    // Number of pieces to burst out (up to 15 pieces)
    var pieces = Math.min(splitsNeeded, Math.max(1, Math.floor(totalMass / 30)));

    // In authentic Agar.io:
    // Large cells (e.g. 5,000 mass) do NOT shred completely.
    // The main cell remains giant and retains 85-90% of its mass in the center,
    // while popping off a ring of small pieces (~15 to 45 mass each) in a 360 starburst.
    var pieceMass = Math.max(12, Math.floor(Math.min(totalMass * 0.02, 45)));
    var angleStep = (Math.PI * 2) / pieces;
    var baseAngle = Math.random() * Math.PI * 2;

    for (var i = 0; i < pieces; i++) {
        if (client.cells.length >= maxCells) break;
        if (consumer.mass < minSplit || consumer.mass <= pieceMass + 20) break;

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
