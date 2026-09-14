var Cell = require('./Cell');

function EjectedMass() {
    Cell.apply(this, Array.prototype.slice.call(arguments));

    this.cellType = 3;
    this.size = 32; // 1:1 OgarII ejectedSize: 38
    this.squareSize = 1024; // 38 * 38
    this.addedAntiTeam = false; // Not to affect anti-teaming two times
    this.isMoving = true;
    this.firstTick = true;
    this.ticksAlive = 0;
}

module.exports = EjectedMass;
EjectedMass.prototype = new Cell();

EjectedMass.prototype.moveEngineTick = function() {
    this.ticksAlive++;
    if (!this.gameServer || !this.isMoving) return;

    // 1:1 OgarII boost displacement and 8/9 friction decay
    this.position.add(this.moveEngine);
    this.moveEngine.scale(0.85);

    if (this.moveEngine.distanceSq() < 1) {
        this.isMoving = false;
        this.moveEngine.set(0, 0);
    }

    // Check for border passage and bounce
    this.borderCheck(true);
    if (this.gameServer.quadTree) {
        this.gameServer.quadTree.update(this);
    }
};

// Override getName which uses 'owner' variable
EjectedMass.prototype.getName = function() {
    return "";
};

// Cell-specific functions
EjectedMass.prototype.getSize = function() {
    return this.size;
};

EjectedMass.prototype.getSquareSize = function() {
    return this.squareSize;
};

EjectedMass.prototype.sendUpdate = function() {
    return true;
};

EjectedMass.prototype.onRemove = function(gameServer) {
    // Remove from list of ejected mass
    var index = this.gameServer.nodesEjected.indexOf(this);
    if (index != -1) {
        this.gameServer.nodesEjected.splice(index, 1);
    }
};

EjectedMass.prototype.onConsume = function(consumer, gameServer) {
    // Adds mass to consumer
    consumer.addMass(this.mass);

    // Check for teaming and apply anti-teaming if required
    if (!this.addedAntiTeam && this.owner && this.owner.checkForWMult) {
        // Smaller W's get more attention
        var influence = this.mass * (Math.log(this.mass) / Math.sqrt(this.mass)) * 2;
        consumer.owner.applyTeaming(influence, 1);
        this.owner.applyTeaming(influence, -1);
    }
};

EjectedMass.prototype.move = function() {
    if (!this.gameServer || !this.isMoving) return;
    // Feed nearby viruses (cellType 2) while moving
    var nearby = this.gameServer.quadTree.query(this.getRange(), function(node) {
        return node && node.cellType == 2;
    });

    for (var i = 0; i < nearby.length; i++) {
        var node = nearby[i];
        if (!node || node.eaten) continue;
        if (node.cellType == 2) {
            if (typeof node.eat === 'function') node.eat(this);
            else if (typeof node.feed === 'function') node.feed(this);
            break;
        }
    }
};
