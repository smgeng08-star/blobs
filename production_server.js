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
    '.json': 'application/json; charset=utf-8',
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
    '.ttf': 'font/ttf',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

var SKINS_DIR = path.join(CLIENT_DIR, 'skins', 'users');
if (!fs.existsSync(SKINS_DIR)) fs.mkdirSync(SKINS_DIR, { recursive: true });

var ACCOUNTS_FILE = path.join(CLIENT_DIR, 'data_accounts.json');
var SCORES_FILE = path.join(CLIENT_DIR, 'data_scores.json');

function getAccounts() {
    if (fs.existsSync(ACCOUNTS_FILE)) {
        try { return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); } catch(e){}
    }
    return {};
}

function saveAccounts(accs) {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accs, null, 2), 'utf8');
}

function getScores() {
    if (fs.existsSync(SCORES_FILE)) {
        try { return JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')); } catch(e){}
    }
    return {};
}

function saveScores(sc) {
    fs.writeFileSync(SCORES_FILE, JSON.stringify(sc, null, 2), 'utf8');
}

// 1. Create HTTP Server for Frontend Assets & Synchronized Global Backend
var server = http.createServer(function(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    var reqUrl = req.url.split('?')[0];

    // API: GET /api/accounts
    if (reqUrl === '/api/accounts' && req.method === 'GET') {
        var accs = getAccounts();
        var safeAccs = {};
        for (var k in accs) {
            safeAccs[k] = {
                username: accs[k].username || k,
                skin: accs[k].skin || (fs.existsSync(path.join(SKINS_DIR, k + '.png')) ? '/skins/users/' + k + '.png' : null),
                createdAt: accs[k].createdAt || Date.now()
            };
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(safeAccs));
        return;
    }

    // API: POST /api/register
    if (reqUrl === '/api/register' && req.method === 'POST') {
        var body = '';
        req.on('data', function(c) { body += c; });
        req.on('end', function() {
            try {
                var data = JSON.parse(body || '{}');
                var u = (data.username || '').trim();
                var p = data.password || '';
                if (!u || !p) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing username or password' }));
                    return;
                }
                var lower = u.toLowerCase();
                var accs = getAccounts();
                if (accs[lower]) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Username already exists' }));
                    return;
                }
                accs[lower] = {
                    username: u,
                    password: p,
                    skin: data.skin || null,
                    createdAt: Date.now()
                };
                saveAccounts(accs);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, username: u }));
            } catch(e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // API: POST /api/login
    if (reqUrl === '/api/login' && req.method === 'POST') {
        var body = '';
        req.on('data', function(c) { body += c; });
        req.on('end', function() {
            try {
                var data = JSON.parse(body || '{}');
                var u = (data.username || '').trim();
                var p = data.password || '';
                var lower = u.toLowerCase();
                var accs = getAccounts();
                if (!accs[lower] || (accs[lower].password && accs[lower].password !== p)) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid username or password' }));
                    return;
                }
                var userSkin = accs[lower].skin;
                if (!userSkin && fs.existsSync(path.join(SKINS_DIR, lower + '.png'))) {
                    userSkin = '/skins/users/' + lower + '.png';
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    username: accs[lower].username || u,
                    skin: userSkin
                }));
            } catch(e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // API: GET /api/skins
    if (reqUrl === '/api/skins' && req.method === 'GET') {
        fs.readdir(SKINS_DIR, function(err, files) {
            var skins = {};
            if (!err && files) {
                files.forEach(function(f) {
                    if (f.endsWith('.png')) {
                        var user = f.replace('.png', '').toLowerCase();
                        skins[user] = '/skins/users/' + f;
                    }
                });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(skins));
        });
        return;
    }

    // API: POST /api/skin (Upload skin for user)
    if (reqUrl === '/api/skin' && req.method === 'POST') {
        var body = '';
        req.on('data', function(c) { body += c; });
        req.on('end', function() {
            try {
                var data = JSON.parse(body || '{}');
                var u = (data.username || '').trim();
                var lower = u.toLowerCase().replace(/[^a-z0-9_-]/gi, '');
                if (lower && data.skin) {
                    var base64Data = data.skin.replace(/^data:image\/\w+;base64,/, '');
                    var buffer = Buffer.from(base64Data, 'base64');
                    fs.writeFileSync(path.join(SKINS_DIR, lower + '.png'), buffer);
                    
                    var accs = getAccounts();
                    if (accs[lower]) {
                        accs[lower].skin = '/skins/users/' + lower + '.png';
                        saveAccounts(accs);
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, url: '/skins/users/' + lower + '.png' }));
                    return;
                } else if (lower && data.skin === null) {
                    var p = path.join(SKINS_DIR, lower + '.png');
                    if (fs.existsSync(p)) fs.unlinkSync(p);
                    var accs = getAccounts();
                    if (accs[lower]) {
                        accs[lower].skin = null;
                        saveAccounts(accs);
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                    return;
                }
            } catch(e){}
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid payload' }));
        });
        return;
    }

    // API: GET /api/leaderboard
    if (reqUrl === '/api/leaderboard' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getScores()));
        return;
    }

    // API: POST /api/score
    if (reqUrl === '/api/score' && req.method === 'POST') {
        var body = '';
        req.on('data', function(c) { body += c; });
        req.on('end', function() {
            try {
                var data = JSON.parse(body || '{}');
                if (data.name && typeof data.score === 'number' && data.score > 0) {
                    var cleanName = data.name.trim().substr(0, 15);
                    if (!(/^blobs#/i.test(cleanName) || cleanName === 'אורח' || cleanName === 'שחקן אנונימי')) {
                        var sc = getScores();
                        if (!sc[cleanName] || data.score > sc[cleanName]) {
                            sc[cleanName] = Math.round(data.score);
                            saveScores(sc);
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, scores: sc }));
                        return;
                    }
                }
            } catch(e){}
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
        });
        return;
    }

    // API: GET /api/servers/status
    if (reqUrl === '/api/servers/status' && req.method === 'GET') {
        var s1Humans = gameServer1 ? gameServer1.getHumanCount() : 0;
        var s2Humans = gameServer2 ? gameServer2.getHumanCount() : 0;
        var s3Humans = gameServer3 ? gameServer3.getHumanCount() : 0;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            server1: { name: 'נסיוני אתגרי', count: s1Humans, max: 90 },
            server2: { name: 'קלאסי', count: s2Humans, max: 90 },
            server3: { name: 'סלף פיד מהיר', count: s3Humans, max: 90 }
        }));
        return;
    }

    // Admin API Endpoints
    if (reqUrl === '/api/admin/players' && req.method === 'GET') {
        var playerList = [];
        var allServers = [
            { gs: gameServer1, name: 'נסיוני' },
            { gs: gameServer2, name: 'קלאסי' },
            { gs: gameServer3, name: 'סלף פיד' }
        ];
        for (var s = 0; s < allServers.length; s++) {
            var item = allServers[s];
            var gs = item.gs;
            if (!gs) continue;
            var serverTag = item.name;
            for (var cIdx = 0; cIdx < gs.clients.length; cIdx++) {
                var cl = gs.clients[cIdx];
                if (!cl) continue;
                var pt = cl.playerTracker;
                if (!pt || cl.fullyDisconnected || pt.fullyDisconnected) continue;

                // STRICT REAL HUMAN CHECK: Exclude server bots, minion bots, and disconnected clients
                if (pt.isBot || cl.isBot || pt.owner || pt.isMinion || pt.isMi) continue;
                if (cl.constructor && (cl.constructor.name === 'FakeSocket' || cl.constructor.name === 'BotSocket')) continue;
                if (pt.constructor && (pt.constructor.name === 'BotPlayer' || pt.constructor.name === 'MinionPlayer')) continue;
                if (cl.readyState !== undefined && cl.readyState !== 1) continue;
                if (pt.disconnect > 0) continue;

                var totalMass = 0;
                for (var cc = 0; cc < pt.cells.length; cc++) {
                    totalMass += (pt.cells[cc].mass || Math.round(pt.cells[cc].size * pt.cells[cc].size / 100) || 0);
                }
                playerList.push({
                    pID: pt.pID,
                    name: (pt.name || '').trim() || 'שחקן אנונימי',
                    server: serverTag,
                    cells: pt.cells.length,
                    mass: Math.round(totalMass),
                    isBot: false
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

                var allServers = [gameServer1, gameServer2, gameServer3];
                for (var s = 0; s < allServers.length; s++) {
                    var gs = allServers[s];
                    if (!gs) continue;
                    for (var cIdx = 0; cIdx < gs.clients.length; cIdx++) {
                        var cl = gs.clients[cIdx];
                        if (cl && cl.playerTracker && (cl.playerTracker.pID === pID || cl.playerTracker.name === data.name)) {
                            var pt = cl.playerTracker;
                            if (pt.cells.length > 0) {
                                pt.cells[0].mass += mass;
                            }
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
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

    if (reqUrl === '/api/admin/givebots' && req.method === 'POST') {
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() {
            try {
                var data = JSON.parse(body || '{}');
                var pID = data.pID;
                var count = parseInt(data.count) || 25;
                var found = false;

                var allServers = [gameServer1, gameServer2, gameServer3];
                for (var s = 0; s < allServers.length; s++) {
                    var gs = allServers[s];
                    if (!gs) continue;
                    for (var cIdx = 0; cIdx < gs.clients.length; cIdx++) {
                        var cl = gs.clients[cIdx];
                        if (cl && cl.playerTracker && (cl.playerTracker.pID === pID || cl.playerTracker.name === data.name)) {
                            var pt = cl.playerTracker;
                            var bName = pt.name || "Minion";
                            for (var b = 0; b < count; b++) {
                                gs.bots.addMinion(pt, bName, 10);
                            }
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
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

    if (reqUrl === '/api/admin/removebots' && req.method === 'POST') {
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() {
            try {
                var data = JSON.parse(body || '{}');
                var pID = data.pID;
                var removedCount = 0;

                var allServers = [gameServer1, gameServer2, gameServer3];
                for (var s = 0; s < allServers.length; s++) {
                    var gs = allServers[s];
                    if (!gs) continue;
                    for (var cIdx = gs.clients.length - 1; cIdx >= 0; cIdx--) {
                        var cl = gs.clients[cIdx];
                        if (cl && cl.playerTracker && cl.playerTracker.isMinion && cl.playerTracker.owner) {
                            if (cl.playerTracker.owner.pID === pID || cl.playerTracker.owner.name === data.name) {
                                if (cl.playerTracker.cells && cl.playerTracker.cells.length > 0) {
                                    for (var cc = cl.playerTracker.cells.length - 1; cc >= 0; cc--) {
                                        gs.removeNode(cl.playerTracker.cells[cc]);
                                    }
                                    cl.playerTracker.cells = [];
                                }
                                if (typeof cl.close === 'function') cl.close();
                                removedCount++;
                            }
                        }
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count: removedCount }));
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
            if (gameServer1) gameServer1.restartGame();
            if (gameServer2) gameServer2.restartGame();
            if (gameServer3) gameServer3.restartGame();
        }, 100);
        return;
    }

    // Static Assets
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
                'Cache-Control': 'no-cache'
            });
            res.end(content);
        }
    });
});

// 2. Initialize GameServer 1 (Experimental / נסיוני אתגרי) on primary HTTP port (3000)
var gameServer1 = new GameServer();
gameServer1.config.serverGamemode = 2; // Experimental (Red mother virus cells active)
gameServer1.config.playerMaxCells = 32; // Experimental allows up to 32 splits
gameServer1.config.serverBots = 5; // 5 bots
gameServer1.gameMode = gameServer1.pluginHandler.gamemodes.retrieveGamemode(2);
gameServer1.startWithHttpServer(server);

// 3. Initialize GameServer 2 (Classic FFA / קלאסי) on port 3001
var CLASSIC_PORT = process.env.CLASSIC_PORT || 3001;
var gameServer2 = new GameServer();
gameServer2.config.serverPort = CLASSIC_PORT;
gameServer2.config.serverGamemode = 0; // Classic FFA
gameServer2.config.playerMaxCells = 16; // Classic FFA maximum 16 splits
gameServer2.config.serverBots = 5; // 5 bots
gameServer2.gameMode = gameServer2.pluginHandler.gamemodes.retrieveGamemode(0);
gameServer2.start();

// 4. Initialize GameServer 3 (Self-Feed / סלף פיד מהיר) on port 3002
var SELFFEED_PORT = process.env.SELFFEED_PORT || 3002;
var gameServer3 = new GameServer();
gameServer3.config.serverPort = SELFFEED_PORT;
gameServer3.config.serverGamemode = 0; // FFA base
gameServer3.config.virusMinAmount = 0; // No viruses on Self-Feed
gameServer3.config.virusMaxAmount = 0; // No viruses on Self-Feed
gameServer3.config.playerStartMass = 400; // 400 starting mass
gameServer3.config.playerMaxMass = 50000; // Auto-split threshold set to 50,000 (instead of 22,500)
gameServer3.config.playerMassDecayRate = 0.0055; // Faster progressive decay rate (loses mass noticeably faster as you get big)
gameServer3.config.playerMaxCells = 64; // Mega split (64 cells)
gameServer3.config.playerRecombineTime = 0; // Instant recombine (0 seconds - merges immediately on touch!)
gameServer3.config.ejectMass = 13; // Classic mass per W
gameServer3.config.ejectMassLoss = 0; // 0 mass loss on shooting W (Self-Feed mode)
gameServer3.config.ejectMassCooldown = 100; // Classic W release cooldown (like Classic)
gameServer3.config.ejectSpeed = 100; // Classic eject speed and trajectory
gameServer3.config.serverResetMass = 100000; // Auto-reset server when any player hits 100,000 mass
gameServer3.config.serverBots = 5; // 5 bots
gameServer3.gameMode = gameServer3.pluginHandler.gamemodes.retrieveGamemode(0);
gameServer3.start();

server.listen(PORT, function() {
    console.log('[Unified Server] Agar.io game & website running on port ' + PORT);
    console.log('[Unified Server] Server 1 (Experimental) on port ' + PORT);
    console.log('[Unified Server] Server 2 (Classic FFA) on port ' + CLASSIC_PORT);
    console.log('[Unified Server] Server 3 (Self-Feed Fast) on port ' + SELFFEED_PORT);
});
