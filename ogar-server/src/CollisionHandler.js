function CollisionHandler(gameServer) {
    // Can make config values for these
    this.baseEatingDistanceMultiplier = 0.5;
    this.baseEatingMassRequired = 1.3;
    this.gameServer = gameServer;
}

module.exports = CollisionHandler;

CollisionHandler.prototype.pushApart = function(cell, check) {
    if (cell.nodeId == check.nodeId) return false; // Can't collide with self

    // Quick bounding box check
    if (!cell.getRange().intersects(check.getRange())) return false;

    var dx = cell.position.x - check.position.x;
    var dy = cell.position.y - check.position.y;
    var distSq = dx * dx + dy * dy;
    var cSz = cell.getSize();
    var chSz = check.getSize();
    var maxDist = cSz + chSz;

    if (distSq >= maxDist * maxDist || distSq === 0) return false;

    var distance = Math.sqrt(distSq);
    var overlap = maxDist - distance;

    // Direction vector from check to cell
    var nx = dx / distance;
    var ny = dy / distance;

    // Mass-based distribution of displacement (smaller cell moves slightly more)
    var totalMass = (cell.mass || 1) + (check.mass || 1);
    var cellRatio = (check.mass || 1) / totalMass;
    var checkRatio = (cell.mass || 1) / totalMass;

    // Apply smooth displacement to separate them
    cell.position.x += nx * (overlap * cellRatio);
    cell.position.y += ny * (overlap * cellRatio);
    check.position.x -= nx * (overlap * checkRatio);
    check.position.y -= ny * (overlap * checkRatio);

    return true;
};

CollisionHandler.prototype.pushEjectedApart = function(cell, check) {
    if (cell.nodeId == check.nodeId) return; // Can't collide with self

    var dx = cell.position.x - check.position.x;
    var dy = cell.position.y - check.position.y;
    var distSq = dx * dx + dy * dy;
    var maxDist = cell.getSize() + check.getSize();

    if (distSq < maxDist * maxDist && distSq > 0) {
        var distance = Math.sqrt(distSq);
        var move = (maxDist - distance) * 0.5;
        var nx = dx / distance;
        var ny = dy / distance;

        cell.position.x += nx * move;
        cell.position.y += ny * move;
        check.position.x -= nx * move;
        check.position.y -= ny * move;
    }
};

CollisionHandler.prototype.canEat = function(cell, check) {
    // Error check
    if (!cell || !check) return;

    // Can't eat self
    if (cell.nodeId == check.nodeId) return false;

    // Cannot eat/be eaten while in range of someone else
    if (check.eaten || check.inRange || cell.eaten || cell.inRange) return false;

    // First check eating distance
    var dist = cell.position.sqDistanceTo(check.position);

    // Food cells (cellType 1) are consumed at the cell border just like in Agar.io
    if (check.cellType == 1) {
        var r = cell.getSize();
        return dist <= r * r;
    }

    // Ejected mass (cellType 3) is consumed at the cell border just like in Agar.io
    if (check.cellType == 3) {
        // In authentic Agar.io, cells cannot eat ejected mass below 16 mass
        if (cell.mass < 16) {
            return false;
        }
        // A cell cannot eat its own freshly ejected mass while it is still moving!
        if (check.owner === cell.owner && check.isMoving) {
            return false;
        }
        var r = cell.getSize();
        if (dist > r * r) return false;
        return true;
    }

    // Virus / MotherCell (cellType 2) collision with player (cellType 0)
    if (check.cellType == 2) {
        // Player can consume green virus if player mass is greater than virus.mass * 1.15
        if (cell.mass < check.mass * 1.15) return false;
        // In authentic Agar.io, collision triggers instantly as player cell touches the spiked virus border
        var hitDist = cell.getSize() + (check.getSize() * 0.35);
        return dist <= hitDist * hitDist;
    }

    // Player vs Player / Own cell eating
    var isOwnCell = (cell.cellType == 0 && check.cellType == 0 && cell.owner && check.owner && cell.owner.pID == check.owner.pID);

    if (isOwnCell) {
        // Check recombine if merge override wasn't triggered
        if (!cell.owner.mergeOverride) {
            if (!cell.shouldRecombine || !check.shouldRecombine || cell.collisionRestoreTicks > 0) return false;
        }
        // Merging own cells: can merge with equal or any mass, standard overlap
        var r1 = cell.getSize();
        var r2 = check.getSize();
        var maxEatDist = r1 - (r2 * 0.35);
        if (maxEatDist <= 0) maxEatDist = r1;
        return dist <= maxEatDist * maxEatDist;
    }

    if (this.gameServer.gameMode.haveTeams &&
        cell.owner && check.owner && cell.owner.team == check.owner.team) {
        return false; // Same team cells can't eat each other
    }

    // Enemy Player cell: In authentic Agar.io, consumer must be at least 1.25x (125%) of victim mass
    var reqMultiplier = 1.25;
    if (cell.mass < check.mass * reqMultiplier) return false;

    // Authentic Agar.io Eating Distance: Victim's center must be deeply engulfed (at least 1/3 inside consumer radius)
    var r1 = cell.getSize();
    var r2 = check.getSize();
    var maxEatDist = r1 - (r2 / 3);
    if (maxEatDist <= 0) return false;

    return dist <= maxEatDist * maxEatDist;
};
