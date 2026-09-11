function ChatMessage(sender, message) {
    this.sender = sender;
    this.message = message;
}

module.exports = ChatMessage;

ChatMessage.prototype.build = function(protocol) {
    var text = this.message || '';
    var senderName = 'Server';
    var color = { r: 100, g: 100, b: 100 };

    if (this.sender) {
        senderName = this.sender.name || 'An unnamed cell';
        if (this.sender.cells && this.sender.cells.length > 0) {
            color = this.sender.cells[0].color || color;
        } else if (this.sender.color) {
            color = this.sender.color;
        }
    }

    if (typeof color === 'string') {
        var hex = color.replace('#', '');
        if (hex.length === 6) {
            color = {
                r: parseInt(hex.substr(0, 2), 16) || 100,
                g: parseInt(hex.substr(2, 2), 16) || 100,
                b: parseInt(hex.substr(4, 2), 16) || 100
            };
        }
    }

    var nameLen = senderName.length;
    var msgLen = text.length;
    var totalBytes = 1 + 1 + 3 + (nameLen * 2 + 2) + (msgLen * 2 + 2);

    var buf = Buffer.alloc ? Buffer.alloc(totalBytes) : new Buffer(totalBytes);
    var offset = 0;

    buf.writeUInt8(99, offset++);
    buf.writeUInt8(0, offset++); // flags
    buf.writeUInt8(color.r || 0, offset++);
    buf.writeUInt8(color.g || 0, offset++);
    buf.writeUInt8(color.b || 0, offset++);

    for (var i = 0; i < nameLen; i++) {
        buf.writeUInt16LE(senderName.charCodeAt(i), offset);
        offset += 2;
    }
    buf.writeUInt16LE(0, offset);
    offset += 2;

    for (var j = 0; j < msgLen; j++) {
        buf.writeUInt16LE(text.charCodeAt(j), offset);
        offset += 2;
    }
    buf.writeUInt16LE(0, offset);
    offset += 2;

    return buf;
};
