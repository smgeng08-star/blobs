const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const CLIENT_DIR = path.join(__dirname, 'cigar-client');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.woff': 'application/font-woff',
    '.woff2': 'application/font-woff2',
    '.ttf': 'application/font-sfnt'
};

const SKINS_DIR = path.join(CLIENT_DIR, 'skins', 'users');
if (!fs.existsSync(SKINS_DIR)) fs.mkdirSync(SKINS_DIR, { recursive: true });

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let reqUrl = req.url.split('?')[0];

    // API: GET /api/skins - List all uploaded user skins
    if (reqUrl === '/api/skins' && req.method === 'GET') {
        fs.readdir(SKINS_DIR, (err, files) => {
            const skins = {};
            if (!err && files) {
                files.forEach(f => {
                    if (f.endsWith('.png')) {
                        const user = f.replace('.png', '').toLowerCase();
                        skins[user] = `/skins/users/${f}`;
                    }
                });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(skins));
        });
        return;
    }

    // API: GET /api/leaderboard - Get global all-time leaderboard
    if (reqUrl === '/api/leaderboard' && req.method === 'GET') {
        const scoresFile = path.join(CLIENT_DIR, 'data_scores.json');
        let scores = {};
        if (fs.existsSync(scoresFile)) {
            try { scores = JSON.parse(fs.readFileSync(scoresFile, 'utf8')); } catch(e){}
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(scores));
        return;
    }

    // API: POST /api/score - Record a new high score globally
    if (reqUrl === '/api/score' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.name && typeof data.score === 'number' && data.score > 0) {
                    const cleanName = data.name.trim().substr(0, 15);
                    if (/^blobs#/i.test(cleanName) || cleanName === 'אורח' || cleanName === 'שחקן אנונימי') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, reason: 'Guest scores not tracked on registered leaderboard' }));
                        return;
                    }
                    const scoresFile = path.join(CLIENT_DIR, 'data_scores.json');
                    let scores = {};
                    if (fs.existsSync(scoresFile)) {
                        try { scores = JSON.parse(fs.readFileSync(scoresFile, 'utf8')); } catch(e){}
                    }
                    if (!scores[cleanName] || data.score > scores[cleanName]) {
                        scores[cleanName] = Math.round(data.score);
                        fs.writeFileSync(scoresFile, JSON.stringify(scores, null, 2), 'utf8');
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, scores: scores }));
                    return;
                }
            } catch(e){}
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid score payload' }));
        });
        return;
    }
    // API: POST /api/skin - Upload user skin
    if (reqUrl === '/api/skin' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.username && data.skin) {
                    const safeUser = data.username.trim().toLowerCase().replace(/[^a-z0-9_-]/gi, '');
                    if (safeUser) {
                        const base64Data = data.skin.replace(/^data:image\/\w+;base64,/, '');
                        const buffer = Buffer.from(base64Data, 'base64');
                        fs.writeFileSync(path.join(SKINS_DIR, `${safeUser}.png`), buffer);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, url: `/skins/users/${safeUser}.png` }));
                        return;
                    }
                } else if (data.username && data.skin === null) {
                    // Remove skin
                    const safeUser = data.username.trim().toLowerCase().replace(/[^a-z0-9_-]/gi, '');
                    const p = path.join(SKINS_DIR, `${safeUser}.png`);
                    if (fs.existsSync(p)) fs.unlinkSync(p);
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

    if (reqUrl === '/') reqUrl = '/index.html';

    const filePath = path.join(CLIENT_DIR, reqUrl);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType
        });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`🌐 Official Agar.io Client Web Server is live on http://localhost:${PORT}`);
    console.log(`🎮 Connected to local Ogar game server on port 3001 (300 Mass, 35 Bots)`);
});
