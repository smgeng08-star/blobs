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
    if (client.cells.length >= maxCells) {
        return;
    }

    // In authentic Agar.io, a virus explosion repeatedly splits the largest available cell in half
    // until the 16 cell limit is reached or cells are too small to split.
    var minSplit = this.gameServer.config.playerMinMassSplit || 36;

    while (client.cells.length < maxCells) {
        var largest = null;
        for (var i = 0; i < client.cells.length; i++) {
            var c = client.cells[i];
            if (!c || c.eaten) continue;
            if (c.mass >= minSplit && (!largest || c.mass > largest.mass)) {
                largest = c;
            }
        }

        // If no cell is large enough to split in half, stop
        if (!largest || largest.mass < minSplit) {
            break;
        }

        // Split the largest cell exactly in half with random explosive angle
        var splitMass = Math.floor(largest.mass / 2);
        var angle = Math.random() * Math.PI * 2;
        this.gameServer.nodeHandler.createPlayerCell(client, largest, angle, splitMass);
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
