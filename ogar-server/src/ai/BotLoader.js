// Project imports
var BotPlayer = require('./BotPlayer');
var FakeSocket = require('./FakeSocket');
var PacketHandler = require('../PacketHandler');

function BotLoader(gameServer) {
    this.gameServer = gameServer;
    this.loadNames();
}

module.exports = BotLoader;

BotLoader.prototype.getName = function() {
    var fixedNames = [
        "טים פרו",
        "בוט נוב",
        "!אל תאכל אותי",
        "טריקספליט",
        "בוט פרו"
    ];
    var name = fixedNames[this.nameIndex % fixedNames.length];
    this.nameIndex++;
    return name;
};

BotLoader.prototype.loadNames = function() {
    this.randomNames = [
        "טים פרו",
        "בוט נוב",
        "!אל תאכל אותי",
        "טריקספליט",
        "בוט פרו"
    ];
    this.nameIndex = 0;
};

BotLoader.prototype.addBot = function() {
    var s = new FakeSocket(this.gameServer);
    s.playerTracker = new BotPlayer(this.gameServer, s);
    s.packetHandler = new PacketHandler(this.gameServer, s);

    // Add to client list
    this.gameServer.clients.push(s);

    // Add to world
    s.packetHandler.setNickname(this.getName());
};

var MinionPlayer = require('./MinionPlayer');
BotLoader.prototype.addMinion = function(owner, name, customMass) {
    var s = new FakeSocket(this.gameServer);
    s.playerTracker = new MinionPlayer(this.gameServer, s, owner, customMass);
    s.packetHandler = new PacketHandler(this.gameServer, s);

    this.gameServer.clients.push(s);
    s.playerTracker.setColor(this.gameServer.getRandomColor());
    s.playerTracker.hasUniqueColor = true;
    var botName = name || (owner && owner.name) || "Player";
    s.packetHandler.setNickname(botName);
    return s.playerTracker;
};
