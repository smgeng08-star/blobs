var Mode = require('./Mode');

function FFA() {
    Mode.apply(this, Array.prototype.slice.call(arguments));

    this.ID = 0;
    this.name = "Free For All";
    this.specByLeaderboard = true;
}

module.exports = FFA;
FFA.prototype = new Mode();

// Override

FFA.prototype.onPlayerSpawn = function(gameServer, player) {
    // Random color
    player.color = gameServer.getRandomColor();

    // Determine start mass based on player type
    var startMass;
    if (player.isBot) {
        startMass = 50;
    } else if (player.owner || player.isMinion) {
        startMass = player.customMass || 10;
    } else if (player.name && player.name.trim().length > 0 && player.name.indexOf('Blobs#') !== 0) {
        startMass = 30;
    } else {
        startMass = gameServer.config.playerStartMass || 10;
    }

    // Spawn player cleanly and reliably
    gameServer.spawnPlayer(player, null, startMass);
};

FFA.prototype.updateLB = function(gameServer) {
    var leaderboard = [];

    // Include all active human players (registered and guests) and server bots, excluding only player minions
    var players = [];
    gameServer.clients.forEach(function(player) {
        if (!player) return;
        if (!player.playerTracker) return;
        if (player.playerTracker.owner) return; // Exclude player minions
        if (!player.playerTracker.cells || player.playerTracker.cells.length <= 0) return;
        if (player.playerTracker.disconnect > 0) return;
        players.push(player.playerTracker);
    });

    players.sort(function(a, b) {
        try {
            return b.getScore(true) - a.getScore(true);
        } catch (e) {
            return 0;
        }
    });

    leaderboard = players.slice(0, gameServer.config.serverMaxLB);

    this.rankOne = leaderboard[0];
    gameServer.leaderboard = leaderboard;
};
