const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;
const MAP_WIDTH = 8000;
const MAP_HEIGHT = 8000;
const MAX_PELLETS = 1000;
const MAX_VIRUSES = 20;

let config = {
    startMass: 300,
    minMass: 10,
    eatRatio: 1.18,
    pelletMass: 1,
    virusMass: 100,
    ejectMass: 14,
    ejectLoss: 18
};

let nextEntityId = 1;
const players = new Map();
const pellets = [];
const viruses = [];
const ejectedMass = [];
const localBots = [];

const PALETTE = ['#38bdf8', '#34d399', '#f43f5e', '#a855f7', '#fbbf24', '#f97316', '#06b6d4', '#ec4899', '#8b5cf6', '#10b981'];
function getRandomColor() { return PALETTE[Math.floor(Math.random() * PALETTE.length)]; }
function massToRadius(mass) { return Math.sqrt(mass * 100); }
function getSpeed(radius) { return Math.max(1.8, 28 / Math.pow(radius, 0.44)); }

function spawnPellets() {
    while (pellets.length < MAX_PELLETS) {
        pellets.push({
            id: nextEntityId++,
            x: (Math.random() - 0.5) * MAP_WIDTH,
            y: (Math.random() - 0.5) * MAP_HEIGHT,
            color: getRandomColor(),
            radius: 4,
            mass: config.pelletMass
        });
    }
}

function spawnViruses() {
    while (viruses.length < MAX_VIRUSES) {
        viruses.push({
            id: nextEntityId++,
            x: (Math.random() - 0.5) * (MAP_WIDTH - 1000),
            y: (Math.random() - 0.5) * (MAP_HEIGHT - 1000),
            color: '#22c55e',
            mass: config.virusMass,
            radius: massToRadius(config.virusMass),
            isVirus: true
        });
    }
}
spawnPellets();
spawnViruses();

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, data) => {
            if (err) { res.writeHead(500); res.end('Error loading client'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }
    if (req.url === '/api/config') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
                try {
                    const n = JSON.parse(body);
                    if (n.startMass !== undefined) config.startMass = Number(n.startMass);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, config }));
                } catch (e) { res.writeHead(400); res.end('err'); }
            });
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(config));
        return;
    }
    res.writeHead(404); res.end('Not found');
});

const wss = new WebSocket.Server({ server });

class Cell {
    constructor(x, y, mass, color, name, isBot = false) {
        this.id = nextEntityId++;
        this.x = x; this.y = y;
        this.mass = mass;
        this.radius = massToRadius(mass);
        this.color = color;
        this.name = name;
        this.isBot = isBot;
        this.targetX = x; this.targetY = y;
        this.recombineTimer = 30;
        this.boostSpeed = 0;
        this.boostAngle = 0;
    }
    update(dt) {
        this.radius = massToRadius(this.mass);
        if (this.boostSpeed > 0) {
            this.x += Math.cos(this.boostAngle) * this.boostSpeed;
            this.y += Math.sin(this.boostAngle) * this.boostSpeed;
            this.boostSpeed *= 0.88;
            if (this.boostSpeed < 1) this.boostSpeed = 0;
        } else {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 5) {
                const speed = getSpeed(this.radius);
                this.x += (dx / dist) * Math.min(speed, dist);
                this.y += (dy / dist) * Math.min(speed, dist);
            }
        }
        const halfW = MAP_WIDTH / 2 - this.radius;
        const halfH = MAP_HEIGHT / 2 - this.radius;
        this.x = Math.max(-halfW, Math.min(halfW, this.x));
        this.y = Math.max(-halfH, Math.min(halfH, this.y));
        if (this.recombineTimer > 0) this.recombineTimer -= dt;
        if (this.mass > 100) this.mass -= this.mass * 0.00012 * dt;
    }
}

class Player {
    constructor(ws, name) {
        this.ws = ws;
        this.name = name || 'Leader';
        this.color = getRandomColor();
        this.cells = [];
        this.targetX = 0; this.targetY = 0;
        this.spawn();
    }
    spawn() {
        this.cells = [];
        const x = (Math.random() - 0.5) * 4000;
        const y = (Math.random() - 0.5) * 4000;
        this.cells.push(new Cell(x, y, config.startMass, this.color, this.name, false));
    }
    split() {
        if (this.cells.length >= 16) return;
        const nc = [];
        for (const c of this.cells) {
            if (c.mass >= 36 && this.cells.length + nc.length < 16) {
                const half = Math.floor(c.mass / 2);
                c.mass = half;
                c.radius = massToRadius(c.mass);
                c.recombineTimer = 25 + half * 0.02;
                const angle = Math.atan2(this.targetY - c.y, this.targetX - c.x);
                const ncell = new Cell(c.x, c.y, half, this.color, this.name, false);
                ncell.boostSpeed = 38;
                ncell.boostAngle = angle;
                ncell.recombineTimer = c.recombineTimer;
                nc.push(ncell);
            }
        }
        this.cells.push(...nc);
    }
    eject() {
        for (const c of this.cells) {
            if (c.mass > 32) {
                c.mass -= config.ejectLoss;
                const angle = Math.atan2(this.targetY - c.y, this.targetX - c.x);
                ejectedMass.push({
                    id: nextEntityId++,
                    x: c.x + Math.cos(angle) * (c.radius + 15),
                    y: c.y + Math.sin(angle) * (c.radius + 15),
                    color: this.color,
                    mass: config.ejectMass,
                    radius: massToRadius(config.ejectMass),
                    vx: Math.cos(angle) * 24,
                    vy: Math.sin(angle) * 24
                });
            }
        }
    }
}

class ServerBot {
    constructor(name, startMass = config.startMass) {
        this.id = nextEntityId++;
        this.name = name;
        this.color = getRandomColor();
        this.x = (Math.random() - 0.5) * 5000;
        this.y = (Math.random() - 0.5) * 5000;
        this.mass = startMass;
        this.radius = massToRadius(this.mass);
        this.targetX = this.x; this.targetY = this.y;
        this.mode = 'tracker';
        this.timer = 0;
    }
    update(dt, leader) {
        this.radius = massToRadius(this.mass);
        if (this.mode === 'tracker' && leader && leader.cells[0]) {
            this.targetX = leader.targetX;
            this.targetY = leader.targetY;
        } else {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.timer = 0.6;
                let nearest = null, minDist = 2000;
                for (let i = 0; i < pellets.length; i += 6) {
                    const p = pellets[i];
                    const d = Math.hypot(p.x - this.x, p.y - this.y);
                    if (d < minDist) { minDist = d; nearest = p; }
                }
                if (nearest) { this.targetX = nearest.x; this.targetY = nearest.y; }
            }
        }
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
            const speed = getSpeed(this.radius);
            this.x += (dx / dist) * Math.min(speed, dist);
            this.y += (dy / dist) * Math.min(speed, dist);
        }
        const halfW = MAP_WIDTH / 2 - this.radius;
        const halfH = MAP_HEIGHT / 2 - this.radius;
        this.x = Math.max(-halfW, Math.min(halfW, this.x));
        this.y = Math.max(-halfH, Math.min(halfH, this.y));
    }
}

const BOT_NAMES = ['Physic_Alpha', 'Physic_Beta', 'Physic_Titan', 'Physic_Zeus', 'Physic_Ninja', 'Physic_God', 'Physic_Pro', 'Physic_King', 'Physic_Ultra', 'Physic_Mega', 'Doge', 'Sirius', 'TYT', 'Zone', 'Orbit', 'Shadow', 'Storm', 'Ghost', 'Viper', 'Apex'];
for (let i = 0; i < 25; i++) {
    localBots.push(new ServerBot(BOT_NAMES[i] || ('Bot_' + (i + 1)), config.startMass));
}

wss.on('connection', ws => {
    let player = null;
    ws.on('message', rawMsg => {
        try {
            const msg = JSON.parse(rawMsg);
            if (msg.type === 'join') {
                player = new Player(ws, msg.name);
                players.set(ws, player);
                ws.send(JSON.stringify({ type: 'joined', config, mapSize: { width: MAP_WIDTH, height: MAP_HEIGHT } }));
            }
            if (msg.type === 'mouse' && player) {
                player.targetX = msg.x; player.targetY = msg.y;
                for (const c of player.cells) { c.targetX = msg.x; c.targetY = msg.y; }
            }
            if (msg.type === 'split' && player) player.split();
            if (msg.type === 'eject' && player) player.eject();
            if (msg.type === 'spawnBots') {
                const count = Math.min(100, Number(msg.count) || 10);
                const mass = Number(msg.mass) || config.startMass;
                for (let i = 0; i < count; i++) {
                    localBots.push(new ServerBot('Physic_' + (localBots.length + 1), mass));
                }
            }
            if (msg.type === 'setBotMode') {
                for (const b of localBots) b.mode = msg.mode;
            }
            if (msg.type === 'feedPlayer' && player && player.cells[0]) {
                const head = player.cells[0];
                for (const b of localBots) {
                    if (b.mass > 35) {
                        b.mass -= 15;
                        const angle = Math.atan2(head.y - b.y, head.x - b.x);
                        ejectedMass.push({
                            id: nextEntityId++,
                            x: b.x + Math.cos(angle) * (b.radius + 15),
                            y: b.y + Math.sin(angle) * (b.radius + 15),
                            color: b.color,
                            mass: 14,
                            radius: massToRadius(14),
                            vx: Math.cos(angle) * 30,
                            vy: Math.sin(angle) * 30
                        });
                    }
                }
            }
            if (msg.type === 'clearBots') localBots.length = 0;
        } catch (_) {}
    });
    ws.on('close', () => players.delete(ws));
});

const TICK_RATE = 25;
const DT = 1 / TICK_RATE;

setInterval(() => {
    for (let i = ejectedMass.length - 1; i >= 0; i--) {
        const em = ejectedMass[i];
        em.x += em.vx; em.y += em.vy;
        em.vx *= 0.86; em.vy *= 0.86;
    }
    const allPlayerCells = [];
    for (const [ws, p] of players) {
        if (p.cells.length === 0) p.spawn();
        for (let i = 0; i < p.cells.length; i++) {
            p.cells[i].update(DT);
            allPlayerCells.push({ cell: p.cells[i], player: p });
        }
        for (let i = 0; i < p.cells.length; i++) {
            for (let j = i + 1; j < p.cells.length; j++) {
                const c1 = p.cells[i], c2 = p.cells[j];
                const d = Math.hypot(c1.x - c2.x, c1.y - c2.y);
                if (d < c1.radius + c2.radius && c1.recombineTimer <= 0 && c2.recombineTimer <= 0) {
                    c1.mass += c2.mass;
                    c1.radius = massToRadius(c1.mass);
                    p.cells.splice(j, 1);
                    j--;
                }
            }
        }
    }
    const leader = players.values().next().value;
    for (const b of localBots) b.update(DT, leader);

    const activeEaters = [...allPlayerCells.map(x => x.cell), ...localBots];
    for (const eater of activeEaters) {
        for (let i = pellets.length - 1; i >= 0; i--) {
            const p = pellets[i];
            if (Math.hypot(p.x - eater.x, p.y - eater.y) < eater.radius) {
                eater.mass += p.mass;
                pellets.splice(i, 1);
            }
        }
        for (let i = ejectedMass.length - 1; i >= 0; i--) {
            const em = ejectedMass[i];
            if (Math.hypot(em.x - eater.x, em.y - eater.y) < eater.radius) {
                eater.mass += em.mass;
                ejectedMass.splice(i, 1);
            }
        }
        for (let i = 0; i < viruses.length; i++) {
            const v = viruses[i];
            if (Math.hypot(v.x - eater.x, v.y - eater.y) < eater.radius && eater.mass > v.mass * 1.15) {
                viruses.splice(i, 1);
                spawnViruses();
                const pEntry = allPlayerCells.find(x => x.cell === eater);
                if (pEntry) {
                    const p = pEntry.player;
                    const pieces = Math.min(8, 16 - p.cells.length);
                    if (pieces > 1) {
                        const splitMass = Math.floor(eater.mass / pieces);
                        eater.mass = splitMass;
                        for (let k = 1; k < pieces; k++) {
                            const angle = (Math.PI * 2 / pieces) * k;
                            const nc = new Cell(eater.x, eater.y, splitMass, p.color, p.name, false);
                            nc.boostSpeed = 26; nc.boostAngle = angle; nc.recombineTimer = 25;
                            p.cells.push(nc);
                        }
                    }
                }
                break;
            }
        }
    }

    for (let i = 0; i < allPlayerCells.length; i++) {
        const c1 = allPlayerCells[i].cell;
        for (let j = localBots.length - 1; j >= 0; j--) {
            const b = localBots[j];
            if (Math.hypot(c1.x - b.x, c1.y - b.y) < c1.radius && c1.mass >= b.mass * config.eatRatio) {
                c1.mass += b.mass;
                localBots.splice(j, 1);
                setTimeout(() => {
                    localBots.push(new ServerBot('Physic_' + (localBots.length + 1), config.startMass));
                }, 800);
            }
        }
    }
    spawnPellets();

    const state = {
        type: 'state',
        pellets: pellets.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), c: p.color })),
        ejected: ejectedMass.map(em => ({ x: Math.round(em.x), y: Math.round(em.y), r: Math.round(em.radius), c: em.color })),
        viruses: viruses.map(v => ({ x: Math.round(v.x), y: Math.round(v.y), r: Math.round(v.radius) })),
        players: Array.from(players.values()).map(p => ({
            name: p.name,
            cells: p.cells.map(c => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.radius), m: Math.round(c.mass), c: c.color }))
        })),
        bots: localBots.map(b => ({ id: b.id, name: b.name, x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.radius), m: Math.round(b.mass), c: b.color }))
    };
    const payload = JSON.stringify(state);
    for (const ws of players.keys()) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
    console.log('⚡ Local Agar server listening on http://localhost:' + PORT);
});
