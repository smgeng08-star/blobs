function ServerStats(humanCount, maxPlayers) { this.humanCount = humanCount; this.maxPlayers = maxPlayers || 90; }

module.exports = ServerStats;

ServerStats.prototype.build = function() {
    var buf = new Buffer(5);
    buf.writeUInt8(88, 0);
    buf.writeUInt16LE(this.humanCount, 1);
    buf.writeUInt16LE(this.maxPlayers, 3);
    return buf;
};
