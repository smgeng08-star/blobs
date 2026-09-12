var FFA = require('./FFA'); // Base gamemode
var Cell = require('../entity/Cell');
var Food = require('../entity/Food');
var Virus = require('../entity/Virus');
var Vector = require('../modules/Vector');

function Experimental() {
    FFA.apply(this, Array.prototype.slice.call(arguments));

    this.ID = 2;
    this.name = "Experimental";
    this.specByLeaderboard = true;

    // Gamemode Specific Variables
    this.nodesMother = [];

    // Config
    this.motherCellMass = 200;
    this.motherMinAmount = 10;
}

module.exports = Experimental;
Experimental.prototype = new FFA();

// Gamemode Specific Functions

Experimental.prototype.spawnMotherCell = function(gameServer) {
    if (this.nodesMother.length < this.motherMinAmount) {
        var pos = gameServer.nodeHandler.getRandomSpawn();
        var m = new MotherCell(gameServer.getNextNodeId(), null, pos, this.motherCellMass, gameServer);
        gameServer.addNode(m);
    }
};

// Override

Experimental.prototype.onServerInit = function(gameServer) {
    gameServer.run = true;
    this.motherMinAmount = 8;
};

Experimental.prototype.onTick = function(gameServer) {
    // 1. Maintain minimum amount of mother cells
    this.spawnMotherCell(gameServer);

    // 2. Actively update every mother cell on every tick!
    for (var i = this.nodesMother.length - 1; i >= 0; i--) {
        var mother = this.nodesMother[i];
        if (!mother) continue;
        mother.eat();
    }
};

Experimental.prototype.onChange = function(gameServer) {
    for (var i = this.nodesMother.length - 1; i >= 0; i--) {
        gameServer.removeNode(this.nodesMother[i]);
    }
};

// Red MotherCell Virus (Authentic Blobs.co.il / Agar.io Experimental)

function MotherCell() {
    Cell.apply(this, Array.prototype.slice.call(arguments));

    this.cellType = 2; // Virus type (spiked)
    this.color = {
        r: 230,
        g: 35,
        b: 60
    };
    this.spiked = 1;
    this.isMotherCell = true;
    this.ownedFood = [];
    this.spawnTick = 0;
    this.heldMass = 0; // Buffer of swallowed player/ejected mass to emit
}

MotherCell.prototype = new Virus();

MotherCell.prototype.getSize = function() {
    // Red MotherCell always keeps fixed, standard virus size (~141 radius)
    return Math.sqrt(100 * (this.mass || 200)) >> 0;
};

MotherCell.prototype.feed = function(feeder) {
    if (!feeder) return;
    feeder.inRange = true;
    feeder.setKiller(this);
    this.gameServer.removeNode(feeder);

    // 75% of ejected mass is buffered to be discharged as standard food
    var absorbed = Math.floor((feeder.mass || 12) * 0.75);
    this.heldMass += absorbed;
    this.spawnFood();
};

MotherCell.prototype.eat = function() {
    this.spawnTick++;

    // Clean up dead/eaten food pellets from array periodically
    if (this.spawnTick % 20 === 0) {
        this.ownedFood = this.ownedFood.filter(function(f) {
            return f && !f.eaten && !f.destroyed && f.gameServer;
        });
    }

    var foodMass = this.gameServer.config.foodMass || 1;

    // RAPID EMISSION OF ABSORBED MASS AS STANDARD FOOD PELLETS
    if (this.heldMass > 0) {
        // Ejection rate: fast spray of standard pellets (e.g. 5 to 40 per tick depending on held mass)
        var pelletsToEmit = Math.max(4, Math.min(Math.floor(this.heldMass * 0.08) + 2, 40));
        pelletsToEmit = Math.min(pelletsToEmit, this.heldMass);

        for (var k = 0; k < pelletsToEmit; k++) {
            this.spawnFood();
        }

        this.heldMass -= pelletsToEmit;
    } else {
        // Progressive ambient food production: authentic cap of ~70 pellets per MotherCell (Agar.io / Blobs standard)
        var foodCount = this.ownedFood.length;
        if (foodCount < 70) {
            var interval = 25; // 1 pellet per second ambiently
            if (foodCount < 20) {
                interval = 10;
            } else if (foodCount < 45) {
                interval = 18;
            }

            if (this.spawnTick % interval === 0) {
                this.spawnFood();
            }
        }
    }

    // Query nearby nodes to consume ejected mass or player cells directly without heavy QuadTree queries
    if (this.spawnTick % 2 === 0) {
        var players = this.gameServer.nodesPlayer;
        for (var i = 0; i < players.length; i++) {
            var pCell = players[i];
            if (pCell && !pCell.eaten) {
                this.checkEatCell(pCell, this.gameServer);
            }
        }
        var ejects = this.gameServer.nodesEjected;
        for (var j = ejects.length - 1; j >= 0; j--) {
            var eNode = ejects[j];
            if (eNode && !eNode.eaten) {
                this.checkEatCell(eNode, this.gameServer);
            }
        }
    }
};

MotherCell.prototype.getRange = function() {
    var sz = this.getSize();
    var Rectangle = require('../modules/Rectangle');
    return new Rectangle(this.position.x, this.position.y, sz, sz);
};

MotherCell.prototype.checkEatCell = function(check, gameServer) {
    if (!check || check.eaten || this.eaten) return;
    if (check.cellType == 1) return; // Food

    var distSq = this.position.sqDistanceTo(check.position);
    var motherRadius = this.getSize();
    var checkRadius = check.getSize();

    // Eat ejected mass (W)
    if (check.cellType == 3) {
        if (distSq <= motherRadius * motherRadius) {
            this.feed(check);
        }
        return;
    }

    // Player cell collision
    if (check.cellType == 0) {
        // If player is smaller than red virus: MotherCell consumes player and buffers exactly 75% of mass to emit as standard food
        if (this.mass > check.mass * 1.05) {
            var hitDist = motherRadius + (checkRadius * 0.25);
            if (distSq <= hitDist * hitDist) {
                check.eaten = true;
                check.setKiller(this);
                gameServer.removeNode(check);

                // Exactly 75% of swallowed player mass is buffered to shoot out as normal food
                var massToEject = Math.floor(check.mass * 0.75);
                this.heldMass += massToEject;
                
                // Immediate initial burst of normal food pellets shot outward
                var initialBurst = Math.min(25, Math.max(5, Math.floor(massToEject * 0.1)));
                for (var b = 0; b < initialBurst; b++) {
                    this.spawnFood();
                }
                this.heldMass -= initialBurst;
                if (this.heldMass < 0) this.heldMass = 0;
            }
        } else if (check.mass > this.mass * 1.15) {
            // Larger player cell eats red virus immediately and pops into pieces!
            var hitDist = checkRadius + (motherRadius * 0.35);
            if (distSq <= hitDist * hitDist) {
                this.eaten = true;
                this.onConsume(check);
                this.setKiller(check);
                gameServer.removeNode(this);
            }
        }
    }
};

MotherCell.prototype.spawnFood = function() {
    var angle = Math.random() * 2 * Math.PI;
    var r = this.getSize();
    // Eject distance: standard 25 to 70 units outward from virus edge
    var dist = r + 15 + Math.random() * 55;
    var pos = {
        x: this.position.x + (dist * Math.sin(angle)),
        y: this.position.y + (dist * Math.cos(angle))
    };

    // Standard Agar.io / Blobs food pellet (mass 1, normal size 10)
    var f = new Food(this.gameServer.getNextNodeId(), null, pos, this.gameServer.config.foodMass || 1, this.gameServer);
    f.setColor(this.gameServer.getRandomColor());

    this.ownedFood.push(f);
    f.insertedList = this.ownedFood;
    this.gameServer.addNode(f);
};

MotherCell.prototype.onAdd = function(gameServer) {
    gameServer.gameMode.nodesMother.push(this);
    // Initial surrounding pellets shot outward (standard halo)
    for (var i = 0; i < 18; i++) {
        this.spawnFood();
    }
};

MotherCell.prototype.onRemove = function(gameServer) {
    var index = gameServer.gameMode.nodesMother.indexOf(this);
    if (index != -1) {
        gameServer.gameMode.nodesMother.splice(index, 1);
    }
};


