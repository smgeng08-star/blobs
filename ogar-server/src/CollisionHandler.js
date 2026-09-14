function CollisionHandler(gameServer) {
    // Can make config values for these
    this.baseEatingDistanceMultiplier = 0.5;
    this.baseEatingMassRequired = 1.3;
    this.gameServer = gameServer;
}

module.exports = CollisionHandler;

CollisionHandler.prototype.pushApart = function(cell, check) {
    if (cell.nodeId == check.nodeId) return false; // Can't collide with self
    if (cell.collisionRestoreTicks > 0 || check.collisionRestoreTicks > 0) return false; // Authentic Agar.io / OgarII playerNoCollideDelay

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

    // Cannot eat if already eaten
    if (check.eaten || cell.eaten) return false;

    // First check eating distance
    var dist = cell.position.sqDistanceTo(check.position);

    // Food cells (cellType 1) are consumed instantly at the cell border
    if (check.cellType == 1) {
        var r = cell.getSize() + (check.getSize() || 10);
        return dist <= r * r;
    }

    // Ejected mass (cellType 3) is consumed at the cell border
    if (check.cellType == 3) {
        // In authentic Agar.io / OgarII, cells cannot eat ejected mass below 19 mass (size < 43.33)
        var minMass = (this.gameServer && this.gameServer.config && this.gameServer.config.serverPort == 3002) ? 10 : 19;
        if (cell.mass < minMass) {
            return false;
        }
        // In all modes (including self feed), ejected mass must fly outward and not get re-absorbed inside the emitting cell before moving!
        if (check.owner === cell.owner && check.sourceCellId === cell.nodeId && (check.firstTick || (check.ticksAlive && check.ticksAlive < 3))) {
            return false;
        }
        var r = cell.getSize() + (check.getSize() || 12);
        return dist <= r * r;
    }

    // Virus / MotherCell (cellType 2) collision with player (cellType 0)
    if (check.cellType == 2) {
        if (cell.owner && cell.owner.godMode) return false; // God mode immune to virus pop

        // Handle Red MotherCell in Experimental gamemode
        if (check.isMotherCell) {
            if (cell.mass > check.mass * 1.15) {
                // Larger player eats red virus and pops
                var hitDist = cell.getSize() + (check.getSize() * 0.35);
                return dist <= hitDist * hitDist;
            } else if (check.mass > cell.mass * 1.05) {
                // Smaller player gets consumed by red virus
                var hitDist = check.getSize() + (cell.getSize() * 0.35);
                if (dist <= hitDist * hitDist) {
                    cell.eaten = true;
                    cell.setKiller(check);
                    this.gameServer.removeNode(cell);
                    check.mass += cell.mass;
                    var initialBurst = Math.min(Math.floor(cell.mass * 0.1), 20);
                    for (var b = 0; b < initialBurst; b++) {
                        check.spawnFood();
                    }
                    check.mass -= (initialBurst * (this.gameServer.config.foodMass || 1));
                    this.gameServer.quadTree.update(check);
                    return false;
                }
            }
            return false;
        }

        // Green virus:
        if (cell.mass < check.mass * 1.15) return false;
        // In authentic Agar.io, collision triggers instantly as player cell touches the spiked virus border
        var hitDist = cell.getSize() + (check.getSize() * 0.35);
        return dist <= hitDist * hitDist;
    }

    // Player vs Player / Own cell eating
    var isOwnCell = (cell.cellType == 0 && check.cellType == 0 && cell.owner && check.owner && cell.owner.pID == check.owner.pID);

    if (isOwnCell) {
        // While cell is in active split boost / no-collide delay, let it shoot forward first!
        if (cell.collisionRestoreTicks > 0 || check.collisionRestoreTicks > 0) {
            return false;
        }

        // When split boost completes:
        // In instant recombine mode (playerRecombineTime === 0 or mergeOverride), merge immediately!
        if (this.gameServer.config.playerRecombineTime !== 0 && !cell.owner.mergeOverride) {
            if (!cell.shouldRecombine || !check.shouldRecombine) return false;
        }

        // Merge when cells touch/overlap
        var r1 = cell.getSize();
        var r2 = check.getSize();
        var maxEatDist = r1 + r2 * 0.15; // Clean instant reconnection as they touch
        return dist <= maxEatDist * maxEatDist;
    }

    if (check.owner && check.owner.godMode) {
        return false; // Cannot eat player with godMode active
    }

    if (this.gameServer.gameMode.haveTeams &&
        cell.owner && check.owner && cell.owner.team == check.owner.team) {
        return false; // Same team cells can't eat each other
    }

    // Enemy Player cell / Bot: In authentic Agar.io / OgarII (worldEatMult = 1.140175425099138 => 1.30x mass)
    var reqMultiplier = 1.30;
    if (cell.mass < check.mass * reqMultiplier) return false;

    // Authentic Agar.io Eating Distance: Victim's center must be deeply engulfed (at least 1/3 inside consumer radius: r1 - r2 / 3)
    // This matches OgarII: d <= a.size - b.size / worldEatOverlapDiv (where worldEatOverlapDiv = 3)
    var r1 = cell.getSize();
    var r2 = check.getSize();
    var maxEatDist = r1 - (r2 / 3);
    if (maxEatDist <= 0) return false;

    return dist <= maxEatDist * maxEatDist;
};
