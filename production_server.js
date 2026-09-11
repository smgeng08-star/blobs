var http = require('http');
var path = require('path');
var fs = require('fs');

var PORT = process.env.PORT || 3000;
var CLIENT_DIR = path.join(__dirname, 'cigar-client');
var OGAR_SRC = path.join(__dirname, 'ogar-server', 'src');

process.chdir(OGAR_SRC);
var GameServer = require(path.join(OGAR_SRC, 'GameServer'));

var MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.cur': 'image/x-win-bitmap',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

// 1. Create HTTP Server for Frontend Assets
var server = http.createServer(function(req, res) {
    var reqUrl = req.url.split('?')[0];
    if (reqUrl === '/') reqUrl = '/index.html';

    var filePath = path.join(CLIENT_DIR, reqUrl);
    var ext = path.extname(filePath).toLowerCase();
    var contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, function(err, content) {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 - Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600'
            });
            res.end(content);
        }
    });
});

// 2. Initialize Ogar GameServer attached to the SAME HTTP server
var gameServer = new GameServer();
gameServer.startWithHttpServer(server);

server.listen(PORT, function() {
    console.log('[Unified Server] Agar.io game & website running on port ' + PORT);
});
