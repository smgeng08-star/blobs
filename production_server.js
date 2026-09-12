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

    // Admin API Endpoints
    if (reqUrl === '/api/admin/players' && req.method === 'GET') {
        var playerList = [];
        for (var cIdx = 0; cIdx < gameServer.clients.length; cIdx++) {
            var cl = gameServer.clients[cIdx];
            if (cl && cl.playerTracker && !cl.fullyDisconnected) {
                var pt = cl.playerTracker;
                var totalMass = 0;
                for (var cc = 0; cc < pt.cells.length; cc++) {
                    totalMass += (pt.cells[cc].mass || 0);
                }
                playerList.push({
                    pID: pt.pID,
                    name: pt.name || 'שחקן אנונימי',
                    cells: pt.cells.length,
                    mass: Math.round(totalMass),
                    isBot: !!pt.isBot
                });
            }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ players: playerList }));
        return;
    }

    if (reqUrl === '/api/admin/givemass' && req.method === 'POST') {
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() {
            try {
                var data = JSON.parse(body || '{}');
                var pID = data.pID;
                var mass = parseInt(data.mass) || 1000;
                var found = false;

                for (var cIdx = 0; cIdx < gameServer.clients.length; cIdx++) {
                    var cl = gameServer.clients[cIdx];
                    if (cl && cl.playerTracker && (cl.playerTracker.pID === pID || cl.playerTracker.name === data.name)) {
                        var pt = cl.playerTracker;
                        if (pt.cells.length > 0) {
                            pt.cells[0].mass += mass;
                        }
                        found = true;
                        break;
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: found }));
            } catch(e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (reqUrl === '/api/admin/restart' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Server restarting...' }));
        
        setTimeout(function() {
            // Re-initialize all nodes, clear players, refill food and viruses
            gameServer.nodesFood = [];
            gameServer.nodesVirus = [];
            gameServer.nodesEjected = [];
            gameServer.nodesPlayer = [];
            if (gameServer.gameMode && gameServer.gameMode.nodesMother) {
                gameServer.gameMode.nodesMother = [];
            }
            gameServer.quadTree.clear();
            
            // Re-spawn initial entities
            for (var f = 0; f < (gameServer.config.foodStartAmount || 1000); f++) {
                gameServer.spawnFood();
            }
            for (var v = 0; v < (gameServer.config.virusMinAmount || 25); v++) {
                gameServer.spawnVirus();
            }
            if (gameServer.gameMode && gameServer.gameMode.onServerInit) {
                gameServer.gameMode.onServerInit(gameServer);
            }

            // Reset scores and re-spawn connected human players
            for (var c = 0; c < gameServer.clients.length; c++) {
                var client = gameServer.clients[c];
                if (client && client.playerTracker) {
                    client.playerTracker.cells = [];
                    client.playerTracker.score = 0;
                    if (client.sendPacket) {
                        client.sendPacket(new (require(path.join(OGAR_SRC, 'packet', 'ClearNodes')))());
                        gameServer.gameMode.onPlayerSpawn(gameServer, client.playerTracker);
                    }
                }
            }
        }, 300);
        return;
    }

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
