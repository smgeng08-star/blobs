// ==UserScript==
// @name         PhysicBot
// @version      1.0
// @description  Agar.io Tracker & Farmer Bot — fully self-contained
// @icon         https://deltav4.gitlab.io/favicon.ico
// @match        *://agar.io/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log('🚀 PhysicBot — Loading...');

    // ─────────────────────────────────────────────
    // CONFIG
    // ─────────────────────────────────────────────
    const SCRIPT_NAME = 'PhysicBot';
    const STORAGE_PREFIX = 'physicbot_';

    const AUTH_SERVER_URL = 'https://physicbot-auth.smgeng08.workers.dev';

    // ─────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────
    let keyValidated = false;
    let keyPromptActive = false;
    let isStarting = false;
    let isStopping = false;
    let stopwatchInterval = null;
    let botCounter = null;
    let botCreationInterval = null;
    let currentMode = 'tracker';
    const bots = [];

    // ─────────────────────────────────────────────
    // KEY SYSTEM  — Remote Cloudflare Auth Server
    // ─────────────────────────────────────────────
    class KeySystem {
        async validate(key) {
            if (!key) return { valid: false, message: '⚠️ Please enter a key' };
            try {
                const res = await fetch(AUTH_SERVER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: key.trim().toUpperCase() })
                });
                const data = await res.json();
                if (data && data.valid) {
                    return { valid: true, data: { username: data.username, token: data.token } };
                }
                return { valid: false, message: data?.message || '❌ Invalid key' };
            } catch (err) {
                return { valid: false, message: '⚠️ Auth server unreachable' };
            }
        }
    }

    const keySystem = new KeySystem();

    // Expose to console for management
    window.physic = {
        validate: (k) => keySystem.validate(k),
        start: () => startBots('start'),
        stop: () => stopBots(),
        setMode: (m) => setBotMode(m),
    };

    // ─────────────────────────────────────────────
    // KEY PROMPT
    // ─────────────────────────────────────────────
    function showKeyPrompt() {
        return new Promise(async resolve => {
            if (keyPromptActive) return;
            keyPromptActive = true;

            // Check stored key first against auth server
            const storedKey = localStorage.getItem(STORAGE_PREFIX + 'valid_key');
            if (storedKey) {
                const r = await keySystem.validate(storedKey);
                if (r && r.valid) { keyValidated = true; keyPromptActive = false; return resolve(true); }
                localStorage.removeItem(STORAGE_PREFIX + 'valid_key');
                localStorage.removeItem(STORAGE_PREFIX + 'username');
            }

            const overlay = document.createElement('div');
            overlay.id = 'pb-key-overlay';
            overlay.style.cssText = `
                position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:1000000000;
                display:flex;align-items:center;justify-content:center;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                backdrop-filter:blur(12px);
            `;

            overlay.innerHTML = `
                <div style="background:rgba(10,14,28,.97);border:1px solid rgba(255,255,255,.08);
                            border-radius:20px;padding:40px 45px;max-width:420px;width:90%;
                            box-shadow:0 20px 60px rgba(0,0,0,.85);text-align:center;">
                    <div style="color:#38bdf8;font-size:28px;font-weight:900;margin-bottom:4px;letter-spacing:1px;">
                        ⚡ ${SCRIPT_NAME}
                    </div>
                    <div style="color:rgba(255,255,255,.4);font-size:13px;margin-bottom:24px;">
                        Enter your license key to activate bots
                    </div>
                    <input type="text" id="pb-key-input" placeholder="YOUR-KEY-HERE"
                        style="width:100%;padding:14px 18px;background:rgba(255,255,255,.06);
                        border:2px solid rgba(255,255,255,.1);border-radius:12px;color:#fff;
                        font-size:16px;box-sizing:border-box;text-align:center;letter-spacing:3px;
                        font-family:'Courier New',monospace;transition:border-color .3s;">
                    <div id="pb-key-error" style="color:#f87171;font-size:13px;margin-top:10px;min-height:20px;"></div>
                    <button id="pb-key-submit"
                        style="margin-top:14px;width:100%;padding:14px;
                        background:linear-gradient(135deg,#0284c7,#0369a1);
                        border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:800;
                        cursor:pointer;transition:all .15s;">✅ Activate</button>
                    <button id="pb-key-cancel"
                        style="margin-top:8px;width:100%;padding:10px;background:transparent;
                        border:1px solid rgba(255,255,255,.08);border-radius:12px;
                        color:rgba(255,255,255,.3);font-size:12px;cursor:pointer;">✖ Cancel</button>
                </div>
            `;

            document.body.appendChild(overlay);

            const input = document.getElementById('pb-key-input');
            const errEl = document.getElementById('pb-key-error');
            const submit = document.getElementById('pb-key-submit');
            const cancel = document.getElementById('pb-key-cancel');

            // Stop key events leaking to game
            input.addEventListener('keydown', e => e.stopPropagation());

            const attempt = async () => {
                const key = input.value.trim().toUpperCase();
                if (!key) { errEl.textContent = '⚠️ Please enter a key'; return; }
                submit.textContent = '⏳ Checking...';
                submit.disabled = true;
                const r = await keySystem.validate(key);
                if (r && r.valid) {
                    localStorage.setItem(STORAGE_PREFIX + 'valid_key', key);
                    localStorage.setItem(STORAGE_PREFIX + 'username', r.data.username);
                    keyValidated = true; keyPromptActive = false;
                    overlay.style.transition = 'opacity .4s';
                    overlay.style.opacity = '0';
                    setTimeout(() => { overlay.remove(); resolve(true); }, 400);
                } else {
                    errEl.textContent = r.message || 'Invalid key';
                    input.style.borderColor = '#f87171';
                    setTimeout(() => { input.style.borderColor = 'rgba(255,255,255,.1)'; }, 1500);
                    submit.textContent = '✅ Activate';
                    submit.disabled = false;
                }
            };

            submit.addEventListener('click', attempt);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
            cancel.addEventListener('click', () => { keyPromptActive = false; overlay.remove(); resolve(false); });
            input.focus();
        });
    }

    // ─────────────────────────────────────────────
    // WORLD MOUSE POSITION  (injected into page context)
    // ─────────────────────────────────────────────
    function injectMouseBridge() {
        const script = document.createElement('script');
        script.textContent = `(function(){
            let mx=0,my=0,wx=0,wy=0,ready=false;
            function getWorld(){
                try{
                    if(window.app&&window.app.unitManager&&window.app.unitManager.activeUnit){
                        const u=window.app.unitManager.activeUnit;
                        if(u.cursor&&typeof u.cursor.x==='number') return {x:u.cursor.x,y:u.cursor.y};
                    }
                    if(window.app&&window.app.mouse){
                        const m=window.app.mouse;
                        if(typeof m.x==='number'&&Math.abs(m.x)<50000) return {x:m.x,y:m.y};
                        if(typeof m.worldX==='number') return {x:m.worldX,y:m.worldY};
                    }
                    if(window.core&&window.core.camera){
                        const c=window.core.camera;
                        if(typeof c.x==='number'&&c.scale>0&&c.scale<100){
                            const px=(mx-c.x)/c.scale,py=(my-c.y)/c.scale;
                            if(Math.abs(px)<50000) return {x:px,y:py};
                        }
                    }
                    for(const k in window){
                        try{const o=window[k];if(o&&o.camera){const c=o.camera;
                            if(typeof c.x==='number'&&c.scale>0&&c.scale<100&&Math.abs(c.x)<1e6){
                                const px=(mx-c.x)/c.scale,py=(my-c.y)/c.scale;
                                if(Math.abs(px)<50000) return {x:px,y:py};
                            }}}catch(e){}
                    }
                }catch(e){}return null;
            }
            document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;},true);
            (function loop(){
                const p=getWorld();
                if(p){wx=p.x;wy=p.y;ready=true;}
                requestAnimationFrame(loop);
            })();
            window.__pb={getX:()=>wx,getY:()=>wy,isReady:()=>ready};
        })();`;
        (document.head || document.documentElement).appendChild(script);
    }

    function waitForBridge(cb) {
        let n = 0;
        const t = setInterval(() => {
            try { if (window.__pb && window.__pb.isReady()) { clearInterval(t); return cb(true); } } catch (_) {}
            if (++n > 30) { clearInterval(t); cb(false); }
        }, 200);
    }

    // ─────────────────────────────────────────────
    // BINARY READER / WRITER  (Agar protocol)
    // ─────────────────────────────────────────────
    class Reader {
        constructor(buf) { this.dv = new DataView(buf); this.pos = 0; }
        u8() { return this.pos < this.dv.byteLength ? this.dv.getUint8(this.pos++) : 0; }
        u16() {
            if (this.pos + 2 > this.dv.byteLength) { this.pos = this.dv.byteLength; return 0; }
            const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v;
        }
        i32() {
            if (this.pos + 4 > this.dv.byteLength) { this.pos = this.dv.byteLength; return 0; }
            const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v;
        }
        u32() {
            if (this.pos + 4 > this.dv.byteLength) { this.pos = this.dv.byteLength; return 0; }
            const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v;
        }
        f32() {
            if (this.pos + 4 > this.dv.byteLength) { this.pos = this.dv.byteLength; return 0; }
            const v = this.dv.getFloat32(this.pos, true); this.pos += 4; return v;
        }
        f64() {
            if (this.pos + 8 > this.dv.byteLength) { this.pos = this.dv.byteLength; return 0; }
            const v = this.dv.getFloat64(this.pos, true); this.pos += 8; return v;
        }
        str() {
            const b = [];
            let c;
            while (this.pos < this.dv.byteLength && (c = this.u8()) !== 0) b.push(c);
            try { return new TextDecoder('utf-8').decode(new Uint8Array(b)); } catch(_) { return ''; }
        }
    }

    class Writer {
        constructor(cap = 1024) {
            this.buf = new ArrayBuffer(cap);
            this.dv = new DataView(this.buf);
            this.pos = 0;
        }
        _grow(n) {
            if (this.pos + n <= this.buf.byteLength) return;
            const nb = new ArrayBuffer(this.buf.byteLength * 2 + n);
            new Uint8Array(nb).set(new Uint8Array(this.buf));
            this.buf = nb; this.dv = new DataView(nb);
        }
        u8(v) { this._grow(1); this.dv.setUint8(this.pos++, v); }
        i16(v) { this._grow(2); this.dv.setInt16(this.pos, v, true); this.pos += 2; }
        u16(v) { this._grow(2); this.dv.setUint16(this.pos, v, true); this.pos += 2; }
        i32(v) { this._grow(4); this.dv.setInt32(this.pos, v, true); this.pos += 4; }
        u32(v) { this._grow(4); this.dv.setUint32(this.pos, v, true); this.pos += 4; }
        f64(v) { this._grow(8); this.dv.setFloat64(this.pos, v, true);this.pos += 8; }
        str(s) {
            const b = new TextEncoder().encode(s);
            this._grow(b.length + 1);
            b.forEach(c => this.dv.setUint8(this.pos++, c));
            this.dv.setUint8(this.pos++, 0);
        }
        out() { return this.buf.slice(0, this.pos); }
    }

    // ─────────────────────────────────────────────
    // DIAGNOSTIC LOGGING & TELEMETRY SYSTEM
    // ─────────────────────────────────────────────
    const PbLogger = {
        spawns: 0,
        spawnAttempts: 0,
        disconnects: 0,
        handshakes: 0,
        errors: 0,
        pkt18: 0, // Arena shutdown / kick
        pkt85: 0, // Arena reset
        codes: {},
        recent: [], // Last 60 events

        log(type, msg) {
            const time = new Date().toTimeString().split(' ')[0];
            const entry = { time, type, msg };
            this.recent.unshift(entry);
            if (this.recent.length > 60) this.recent.pop();
        },

        recordOpen(index) {
            this.log('INFO', `Bot #${index} connected`);
        },

        recordClose(code, reason, index) {
            this.disconnects++;
            this.codes[code] = (this.codes[code] || 0) + 1;
            let note = 'Code ' + code;
            if (code === 1006) note = '1006 (Abnormal: Dropped by Miniclip TCP)';
            else if (code === 1000) note = '1000 (Clean close)';
            else if (code === 1008) note = '1008 (Policy Violation / Anti-Bot)';
            else if (code === 1001) note = '1001 (Server going away)';
            this.log('DISCONNECT', `Bot #${index} closed: ${note}`);
            this._updateStatsUI();
        },

        recordError(index) {
            this.errors++;
            this.log('DISCONNECT', `Bot #${index} socket error`);
        },

        recordSpawn(ok, index) {
            if (ok) {
                this.spawns++;
                this.log('SPAWN', `Bot #${index} spawned into arena`);
                this._updateStatsUI();
            }
        },

        recordPacket(id, index = 0) {
            if (id === 18) {
                this.pkt18++;
                this.log('SERVER_KICK', `Server sent Packet 18 (Arena Kick/Restart) to #${index}`);
                this._updateStatsUI();
            } else if (id === 85) {
                this.pkt85++;
                this.log('SERVER_KICK', `Server sent Packet 85 (Arena Reset)`);
            } else if (id === 241) {
                this.handshakes++;
            }
        },

        getTopReason() {
            if (this.pkt18 > 5) return `Pkt18 Kick (x${this.pkt18})`;
            let maxC = null, maxCount = 0;
            for (const [c, n] of Object.entries(this.codes)) {
                if (n > maxCount) { maxCount = n; maxC = c; }
            }
            if (!maxC) return 'None';
            if (maxC === '1006') return `Miniclip Drop (1006: x${maxCount})`;
            if (maxC === '1008') return `Anti-Bot Kick (1008: x${maxCount})`;
            return `Code ${maxC} (x${maxCount})`;
        },

        _updateStatsUI() {
            const elHtDrop = document.getElementById('pb-ht-drop');
            if (elHtDrop) elHtDrop.textContent = this.getTopReason();
        },

        getReportText() {
            const now = new Date().toLocaleString();
            let text = `=== PHYSIC BOTNET DIAGNOSTIC REPORT ===\nTimestamp: ${now}\nTotal Spawns: ${this.spawns}\nTotal Disconnects: ${this.disconnects}\nServer Kicks (Pkt 18): ${this.pkt18}\nServer Resets (Pkt 85): ${this.pkt85}\nCodes breakdown:\n`;
            for (const [c, n] of Object.entries(this.codes)) {
                text += `  - Code ${c}: ${n}\n`;
            }
            text += `\nRecent 20 events:\n`;
            this.recent.slice(0, 20).forEach(e => {
                text += `[${e.time}] [${e.type}] ${e.msg}\n`;
            });
            return text;
        },

        reset() {
            this.spawns = 0;
            this.spawnAttempts = 0;
            this.disconnects = 0;
            this.handshakes = 0;
            this.errors = 0;
            this.pkt18 = 0;
            this.pkt85 = 0;
            this.codes = {};
            this.recent = [];
            this._updateStatsUI();
        }
    };
    window.pbLogger = PbLogger;

    // ─────────────────────────────────────────────
    // CONNECTION DISPATCHER (LEAKY BUCKET QUEUE)
    // Prevents Miniclip IP rate-limiting & 1006 drops
    // Paces all connection attempts smoothly (1 per 120ms)
    // ─────────────────────────────────────────────
    const PbQueue = {
        queue: [],
        interval: null,
        RATE_MS: 120, // ~8 connections/sec, completely safe under Miniclip firewall

        add(bot) {
            if (!bot || bot.queued || bot.stopped || !cfg.running) return;
            bot.queued = true;
            this.queue.push(bot);
            this._start();
        },

        _start() {
            if (this.interval) return;
            this.interval = setInterval(() => {
                if (!cfg.running || this.queue.length === 0) {
                    clearInterval(this.interval);
                    this.interval = null;
                    return;
                }
                const bot = this.queue.shift();
                if (bot) {
                    bot.queued = false;
                    if (!bot.stopped && cfg.running) {
                        try { bot.connectNow(); } catch (_) {}
                    }
                }
            }, this.RATE_MS);
        },

        clear() {
            if (this.interval) { clearInterval(this.interval); this.interval = null; }
            this.queue.forEach(b => { if (b) b.queued = false; });
            this.queue = [];
        }
    };
    window.pbQueue = PbQueue;

    // ─────────────────────────────────────────────
    // BOT
    // ─────────────────────────────────────────────
    class Bot {
        constructor(cfg, botIndex = 0) {
            this.cfg = cfg;
            this.botIndex = botIndex;
            this.ws = null;
            this.stopped = false;
            this.alive = false;
            this.connected = false;
            this.queued = false;

            this.myCells = [];
            this.cellMap = {};
            this.ghostCells = [];

            this.encKey = 0;
            this.decKey = 0;
            this.serverVer = '';

            this.offsetX = 0;
            this.offsetY = 0;
            this.botX = 0; this.botY = 0; this.botSize = 0;

            this.mode = 'tracker';
            this.moveTimer = null;
            this.reconnTimer = null;
            this.errTimer = null;
            this.reconnecting = false;
            this.attempts = 0;
            this.maxAttempts = 5;

            this._cache = null;
            this._cacheTs = 0;
            this._target = null;
            this._targetTs = 0;
            this._skipN = 0;

            this.name = localStorage.getItem(STORAGE_PREFIX + 'bot_name') || 'PhysicBot';

            this.PROTOCOL = 23;
            this.CLIENT = 31116;

            this.connect();
        }

        // ── CONNECTION ──────────────────────────────
        connect() {
            if (this.stopped || !this.cfg.running || !this.cfg.server) return;
            PbQueue.add(this);
        }

        connectNow() {
            if (this.stopped || !this.cfg.running || !this.cfg.server) return;
            this._reset();
            try {
                this.ws = new WebSocket(this.cfg.server);
                this.ws._pbBot = true;
                this.ws.binaryType = 'arraybuffer';
                this.ws.onopen = () => { try { this._onopen(); } catch (_) {} };
                this.ws.onclose = (e) => { try { this._onclose(e); } catch (_) {} };
                this.ws.onerror = (e) => { try { this._onerror(e); } catch (_) {} };
                this.ws.onmessage = e => { try { this._onmessage(e); } catch (_) {} };
                this.attempts++;
                setTimeout(() => {
                    try {
                        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) this.ws.close();
                    } catch (_) {}
                }, 8000);
            } catch (_) {
                this._reconnect();
            }
        }

        _reset() {
            this.ws = null;
            this.alive = false; this.connected = false;
            this.myCells = []; this.cellMap = {}; this.ghostCells = [];
            this.encKey = 0; this.decKey = 0;
            this.botX = 0; this.botY = 0; this.botSize = 0;
            this._cache = null; this._target = null;
            this._lastMove = 0; // rate-limit timestamp
            this.spawnAttempts = 0;
        }

        _onopen() {
            this.connected = true;
            PbLogger.recordOpen(this.botIndex);
            this._sendRaw(this._w254());
            this._sendRaw(this._w255());
        }
        _w254() { const w = new Writer(5); w.u8(254); w.u32(this.PROTOCOL); return w.out(); }
        _w255() { const w = new Writer(5); w.u8(255); w.u32(this.CLIENT); return w.out(); }

        _onclose(e) {
            this.connected = false;
            this.alive = false;
            PbLogger.recordClose(e?.code || 1006, e?.reason || '', this.botIndex);
            this._reconnect();
        }
        _onerror(e) {
            this.connected = false;
            this.alive = false;
            PbLogger.recordError(this.botIndex);
            try { if (this.ws?.readyState <= 1) this.ws.close(); } catch (_) {}
        }

        _reconnect() {
            if (this.queued || this.stopped || !this.cfg.running) return;
            const delay = Math.min(3500, 800 + Math.floor(Math.random() * 800) + (this.attempts * 200));
            clearTimeout(this.reconnTimer);
            this.reconnTimer = setTimeout(() => {
                if (!this.stopped && this.cfg.running) {
                    PbQueue.add(this);
                }
            }, delay);
        }

        reconnectSafe() {
            if (this.queued || this.stopped || !this.cfg.running) return;
            clearTimeout(this.reconnTimer);
            if (this.ws) {
                try {
                    this.ws.onopen = null; this.ws.onclose = null;
                    this.ws.onerror = null; this.ws.onmessage = null;
                    this.ws.close();
                } catch (_) {}
                this.ws = null;
            }
            this.connected = false;
            this.alive = false;
            PbQueue.add(this);
        }

        // ── SEND ────────────────────────────────────
        _sendRaw(data) {
            try {
                if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
            } catch (_) {}
        }

        _send(data) {
            try {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
                if (this.encKey) {
                    data = this._xor(data, this.encKey);
                    this.encKey = this._rotKey(this.encKey);
                }
                this.ws.send(data);
            } catch (_) {}
        }

        // ── RECEIVE ────────────────────────────────
        _onmessage(e) {
            try {
                let data = e.data;
                if (this.decKey) data = this._xor(data, this.decKey ^ this.CLIENT);
                this._parse(data);
            } catch (_) {}
        }

        _parse(buf) {
            const r = new Reader(buf);
            const opcode = r.u8();
            switch (opcode) {
                case 18:
                    PbLogger.recordPacket(18, this.botIndex);
                    setTimeout(() => { try { this.ws?.close(); } catch(_) {} }, 800);
                    break;
                case 32:
                    PbLogger.recordSpawn(true, this.botIndex);
                    this._handleSpawn(r);
                    break;
                case 69: this._handleGhosts(r); break;
                case 85:
                    PbLogger.recordPacket(85, this.botIndex);
                    this._handleReset();
                    break;
                case 241:
                    PbLogger.recordPacket(241, this.botIndex);
                    this._handleHandshake(r);
                    break;
                case 242: this._spawn(); break;
                case 255: this._handleCompressed(r); break;
            }
        }

        _handleSpawn(r) {
            this.myCells.push(r.u32());
            this.attempts = 0; // Reset attempts on successful spawn!
            this.spawnAttempts = 0;
            if (!this.alive) {
                this.alive = true;
            }
        }

        _handleGhosts(r) {
            const n = r.u16(); this.ghostCells = [];
            for (let i = 0; i < n && r.pos + 12 <= r.dv.byteLength; i++) {
                const x = r.i32(), y = r.i32(), m = r.u32();
                if (Math.abs(x) < 14142 && Math.abs(y) < 14142 && m > 0)
                    this.ghostCells.push({ x, y, size: Math.sqrt(m) * 10 });
            }
        }

        _handleReset() {
            setTimeout(() => {
                if (!this.stopped && this.cfg.running) { try { this.connect(); } catch(_) {} }
            }, 800);
        }

        _handleHandshake(r) {
            this.decKey = r.u32();
            this.serverVer = r.str();
            this.attempts = 0; // Handshake OK - reset attempts counter!
            const m = this.cfg.server.match(/wss:\/\/(web-arenas-live-[\w-]+\.agario\.miniclippt\.com\/[\w-]+\/[\d-]+)/);
            if (m) this.encKey = this._murmur2(m[1] + this.serverVer, 255);
        }

        _handleCompressed(r) {
            try {
                const len = r.u32();
                if (!len || len > 2000000) return;
                const out = new Uint8Array(len);
                const compressed = new Uint8Array(r.dv.buffer.slice(r.pos));
                const res = this._lz4(compressed, out);
                if (res && res.buffer) this._parseFull(res.buffer);
            } catch (_) {}
        }

        _parseFull(buf) {
            const r = new Reader(buf);
            switch (r.u8()) {
                case 16: this._updateNodes(r); break;
                case 64: this._updateOffset(r); break;
            }
        }

        _updateOffset(r) {
            const minX = r.f64(), minY = r.f64(), maxX = r.f64(), maxY = r.f64();
            if (maxX - minX > 14000) this.offsetX = (maxX + minX) / 2;
            if (maxY - minY > 14000) this.offsetY = (maxY + minY) / 2;
        }

        _updateNodes(r) {
            try {
                const nc = r.u16();
                for (let i = 0; i < nc; i++) r.pos += 8;
                const now = Date.now();
                while (r.pos + 4 <= r.dv.byteLength) {
                    const id = r.u32(); if (id === 0) break;
                    const e = { id, x: r.i32(), y: r.i32(), size: r.u16(), isVirus: false, isPellet: false, isFriend: false, name: '', lastSeen: now };
                    const f = r.u8(), xf = f & 128 ? r.u8() : 0;
                    if (f & 1) e.isVirus = true;
                    if (f & 2) r.pos += 3;
                    if (f & 4) { try { r.str(); } catch(_) {} }
                    if (f & 8) { try { e.name = r.str(); } catch(_) { e.name = ''; } }
                    if (xf & 1) e.isPellet = true;
                    if (xf & 2) e.isFriend = true;
                    if (xf & 4) r.pos += 4;
                    this.cellMap[id] = e;
                }
                const rc = r.u16();
                for (let i = 0; i < rc; i++) {
                    const rid = r.u32();
                    const idx = this.myCells.indexOf(rid);
                    if (idx !== -1) this.myCells.splice(idx, 1);
                    delete this.cellMap[rid];
                }
                // Memory cleanup: remove entities not seen for 5+ seconds
                if (now - (this._lastClean || 0) > 4000) {
                    this._lastClean = now;
                    for (const id in this.cellMap) {
                        if (now - this.cellMap[id].lastSeen > 5000) delete this.cellMap[id];
                    }
                }
                if (this.alive && this.myCells.length === 0) { this.alive = false; this._spawn(); }
            } catch (_) {}
        }

        _getSpawnName() {
            if (this.cfg.skinMode === 'random') {
                // Confirmed working Agar.io Keyword & YouTuber Skins
                const NATIVE_SKINS = [
                    // Viral Political & Famous Figures
                    'Trump', 'Obama', 'Sir', 'Kim Jong-un', 'hillary', 'clinton', 'merkel',
                    'stalin', 'dilma', 'cameron', 'tsipras', 'fidel', 'Kristoffer',

                    // Legendary Agar.io YouTubers
                    'Crystal', 'Sirius', 'TYT', 'n0psa', 'MatJoy', 'Zone', 'Timid',

                    // Classic Secret Memes & Brands
                    'pokerface', 'doge', 'sanik', 'wojak', 'bait', 'ayy lmao',
                    'nasa', 'cia', 'steam', 'reddit', '4chan', '9gag',
                    'facebook', 'origin', 'stussy', 'prodota',

                    // Space / Planets
                    'earth', 'moon', 'mars',

                    // Verified Country Flags
                    'usa', 'germany', 'france', 'japan', 'brazil', 'canada', 'spain', 'italy',
                    'australia', 'argentina', 'portugal', 'netherlands'
                ];
                return NATIVE_SKINS[Math.floor(Math.random() * NATIVE_SKINS.length)];
            }
            return this.name;
        }

        _spawn() {
            this._lastSpawn = Date.now();
            const spawnName = this._getSpawnName();
            const w = new Writer(spawnName.length * 4 + 10);
            w.u8(0); w.str(spawnName); w.u32(132);
            this._send(w.out());
        }

        checkRespawn() {
            // Keep-alive respawn: if connected to server & handshake ready but dead/unspawned
            if (this.ws?.readyState === WebSocket.OPEN && this.decKey && !this.alive && this.myCells.length === 0) {
                const now = Date.now();
                if (now - (this._lastSpawn || 0) > 2200) {
                    this.spawnAttempts = (this.spawnAttempts || 0) + 1;
                    if (this.spawnAttempts > 14) {
                        // If server ignored spawn for 30+ seconds, smoothly recycle via queue
                        this.spawnAttempts = 0;
                        this.reconnectSafe();
                        return;
                    }
                    this._spawn();
                }
            }
        }

        _move() {
            // Rate-limit: 55ms (~18 updates/sec) is optimal for agar.io - keeps movement silky smooth
            // while cutting packet flood in half, eliminating TCP 1006 buffer drops completely!
            const interval = window.__pbBackground ? 120 : 55;
            const now = Date.now();
            if (now - this._lastMove < interval) return;
            this._lastMove = now;

            if (!this.myCells.length) return;
            let bx = 0, by = 0, bs = 0;
            for (const id of this.myCells) {
                const c = this.cellMap[id];
                if (c) { bx += c.x; by += c.y; bs += c.size; }
            }
            bx /= this.myCells.length; by /= this.myCells.length;
            this.botX = bx; this.botY = by; this.botSize = bs;

            let tx, ty;
            if (this.mode === 'tracker') {
                // Tracker Mode: 100% loyal to mouse cursor without dodging away from your target
                const mp = this._mouseWorld();
                tx = mp.x + this.offsetX;
                ty = mp.y + this.offsetY;
            } else {
                // Farmer Mode: Search for food while smartly dodging predators and viruses
                const evade = this._getEvadeVector(bx, by, bs);
                if (evade.inDanger) {
                    tx = bx + evade.forceX;
                    ty = by + evade.forceY;
                } else {
                    ({ x: tx, y: ty } = this._farmTarget(bx, by, bs));
                }
            }

            const w = new Writer(13);
            w.u8(16); w.i32(Math.floor(tx)); w.i32(Math.floor(ty)); w.u32(this.decKey);
            this._send(w.out());
        }

        _isSwarmCell(cellId) {
            for (let i = 0; i < bots.length; i++) {
                if (bots[i].myCells && bots[i].myCells.includes(cellId)) return true;
            }
            return false;
        }

        _getEvadeVector(bx, by, bs) {
            const ents = this._entities();
            let forceX = 0, forceY = 0;
            let inDanger = false;
            const mouse = this._mouseWorld();
            const playerX = mouse.x + this.offsetX;
            const playerY = mouse.y + this.offsetY;

            for (let i = 0; i < ents.length; i++) {
                const e = ents[i];
                if (!e || e.isPellet || e.isFriend) continue;

                // NEVER evade own cells or any bot belonging to our swarm!
                if (this.myCells.includes(e.id) || this._isSwarmCell(e.id)) continue;
                if (e.name && e.name === this.name) continue;

                // Do not evade the player (player's cells hover near mouse position)
                const distToPlayer = Math.hypot(e.x - playerX, e.y - playerY);
                if (distToPlayer < 220) continue;

                const dx = bx - e.x;
                const dy = by - e.y;
                const dist = Math.hypot(dx, dy);

                // 1. VIRUS EVASION:
                if (e.isVirus) {
                    // If bot size is close to or larger than virus (~100+), virus will POP the bot!
                    // Even if smaller, steer clear to prevent getting pinned against green spikes
                    const safeDist = bs + e.size + (bs > 95 ? 120 : 60);
                    if (dist < safeDist && dist > 0) {
                        inDanger = true;
                        const factor = (safeDist - dist) / safeDist;
                        const p = (bs > 95 ? 3.0 : 1.5) * factor * 700;
                        forceX += (dx / dist) * p;
                        forceY += (dy / dist) * p;
                    }
                    continue;
                }

                // 2. ENEMY PREDATOR EVASION:
                // An enemy can eat this bot if their size is at least 15% bigger
                if (e.size > bs * 1.15) {
                    // Check if enemy can split-kill (enemy size > 1.45x bot size) -> wider safety margin
                    const canSplit = e.size > bs * 1.45;
                    const safeDist = bs + e.size + (canSplit ? 450 : 250);

                    if (dist < safeDist && dist > 0) {
                        inDanger = true;
                        const factor = (safeDist - dist) / safeDist;
                        const p = (canSplit ? 3.5 : 2.0) * factor * 950;
                        forceX += (dx / dist) * p;
                        forceY += (dy / dist) * p;
                    }
                }
            }

            return { inDanger, forceX, forceY };
        }

        _farmTarget(bx, by, bs) {
            const ents = this._entities();
            let best = -Infinity, tx = bx, ty = by;
            for (const e of ents) {
                if (!e || e.isFriend || e.name === this.name) continue;
                if (this._isSwarmCell(e.id)) continue; // Never target fellow bots

                // Never target viruses as food if our size puts us at risk of popping!
                if (e.isVirus) continue;

                const dx = e.x - bx, dy = e.y - by;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const rd = Math.max(0, dist - bs - e.size);
                if (rd > 600) continue;
                let score = -Infinity;
                if (e.isPellet && !e.isVirus) score = 1000 - rd;
                else if (!e.isVirus && !e.isPellet && e.size < bs * .7) score = 600 - rd;
                if (score > best) { best = score; tx = e.x; ty = e.y; }
            }
            if (best === -Infinity) {
                this._skipN = (this._skipN + 1) % 5;
                const now = Date.now();
                if (this._skipN === 0 || !this._target || now - this._targetTs > 5000 ||
                    Math.hypot(this._target.x - bx, this._target.y - by) < 50) {
                    const a = Math.random() * Math.PI * 2, r = 200 + Math.random() * 400;
                    this._target = { x: bx + Math.cos(a) * r, y: by + Math.sin(a) * r };
                    this._targetTs = now;
                }
                return this._target;
            }
            return { x: tx, y: ty };
        }

        _entities() {
            const now = Date.now();
            if (!this._cache || now - this._cacheTs > 300) {
                const arr = [];
                for (const id in this.cellMap) {
                    const e = this.cellMap[id];
                    if (e && !this.myCells.includes(e.id)) arr.push(e);
                }
                this._cache = arr;
                this._cacheTs = now;
            }
            return this._cache;
        }

        _mouseWorld() {
            try {
                if (window.__pb) {
                    const x = window.__pb.getX(), y = window.__pb.getY();
                    if (isFinite(x) && Math.abs(x) < 50000) return { x, y };
                }
            } catch (_) {}
            return { x: window.innerWidth / 2 + this.offsetX, y: window.innerHeight / 2 + this.offsetY };
        }

        split() {
            if (this.mode !== 'tracker') return;
            const avg = this._avgSize(); if (avg >= 80) this._send(new Uint8Array([17]).buffer);
        }
        eject() {
            if (this.mode !== 'tracker') return;
            const avg = this._avgSize(); if (avg >= 80) this._send(new Uint8Array([21]).buffer);
        }
        _avgSize() {
            let t = 0, n = 0;
            for (const id of this.myCells) { const c = this.cellMap[id]; if (c) { t += c.size; n++; } }
            return n ? t / n : 0;
        }

        setMode(m) { this.mode = m; }

        stop() {
            this.stopped = true;
            this.queued = false;
            this.reconnecting = false;
            clearInterval(this.moveTimer);
            clearTimeout(this.errTimer);
            clearTimeout(this.reconnTimer);
            if (this.ws) {
                try {
                    this.ws.onopen = null;
                    this.ws.onclose = null;
                    this.ws.onerror = null;
                    this.ws.onmessage = null;
                    this.ws.close();
                } catch (_) {}
                this.ws = null;
            }
            this.connected = false;
            this.alive = false;
        }

        // ── CRYPTO / COMPRESSION ────────────────────
        _rotKey(k) {
            k = Math.imul(k, 1540483477) >> 0;
            k = (Math.imul(k >>> 24 ^ k, 1540483477) >> 0) ^ 114296087;
            k = Math.imul(k >>> 13 ^ k, 1540483477) >> 0;
            return k >>> 15 ^ k;
        }

        _xor(buf, key) {
            const dv = new DataView(buf);
            for (let i = 0; i < dv.byteLength; i++)
                dv.setUint8(i, dv.getUint8(i) ^ (key >>> (i % 4 * 8) & 255));
            return buf;
        }

        _lz4(src, out) {
            try {
                for (let i = 0, j = 0; i < src.length;) {
                    const tok = src[i++];
                    let ll = tok >> 4;
                    if (ll) {
                        for (let ex = ll + 240; ex === 255;) { ex = src[i++]; ll += ex; }
                        const end = i + ll;
                        while (i < end && j < out.length) out[j++] = src[i++];
                        if (i >= src.length || j >= out.length) return out;
                    }
                    if (i + 1 >= src.length) break;
                    const off = src[i++] | src[i++] << 8;
                    if (!off || off > j) return out;
                    let ml = tok & 15;
                    for (let ex = ml + 240; ex === 255;) { ex = src[i++]; ml += ex; }
                    let p = j - off, end = j + ml + 4;
                    while (j < end && j < out.length && p < out.length) out[j++] = out[p++];
                }
            } catch (_) {}
            return out;
        }

        _murmur2(str, seed) {
            let len = str.length, h = seed ^ len, i = 0;
            while (len >= 4) {
                let k = str.charCodeAt(i) & 255 | (str.charCodeAt(++i) & 255) << 8 |
                        (str.charCodeAt(++i) & 255) << 16 | (str.charCodeAt(++i) & 255) << 24;
                k = (k & 65535) * 1540483477 + (((k >>> 16) * 1540483477 & 65535) << 16);
                k ^= k >>> 24;
                k = (k & 65535) * 1540483477 + (((k >>> 16) * 1540483477 & 65535) << 16);
                h = (h & 65535) * 1540483477 + (((h >>> 16) * 1540483477 & 65535) << 16) ^ k;
                len -= 4; ++i;
            }
            switch (len) {
                case 3: h ^= (str.charCodeAt(i + 2) & 255) << 16; // fall-through
                case 2: h ^= (str.charCodeAt(i + 1) & 255) << 8; // fall-through
                case 1: h ^= str.charCodeAt(i) & 255;
                    h = (h & 65535) * 1540483477 + (((h >>> 16) * 1540483477 & 65535) << 16);
            }
            h ^= h >>> 13;
            h = (h & 65535) * 1540483477 + (((h >>> 16) * 1540483477 & 65535) << 16);
            return (h ^ h >>> 15) >>> 0;
        }
    }

    // ─────────────────────────────────────────────
    // BOT MANAGER CONFIG
    // ─────────────────────────────────────────────
    const cfg = {
        server: null,
        running: false,
        keybinds: { feed: 'R', split: 'E', hide: 'H', tracker: 'F', farmer: 'V', hybrid: 'C' },
        botCount: parseInt(localStorage.getItem(STORAGE_PREFIX + 'bot_qty')) || 150,
        skinMode: (localStorage.getItem(STORAGE_PREFIX + 'skin_mode') === 'default') ? 'default' : 'random',
        showMass: localStorage.getItem(STORAGE_PREFIX + 'show_mass') !== 'false',
    };

    // ─────────────────────────────────────────────
    // MASTER MOVE LOOP  (replaces 150 setIntervals)
    // ─────────────────────────────────────────────
    let masterLoopId = null;

    function _startMasterLoop() {
        if (masterLoopId !== null) return; // already running

        function loop() {
            if (!cfg.running) { masterLoopId = null; return; }
            // Process all alive bots in one RAF frame — each bot
            // self-throttles to 33ms so no WS spam even at 60fps
            for (let i = 0; i < bots.length; i++) {
                const b = bots[i];
                if (b && b.alive && !b.stopped) {
                    try { b._move(); } catch (_) {}
                }
            }
            masterLoopId = requestAnimationFrame(loop);
        }

        masterLoopId = requestAnimationFrame(loop);
    }

    function _stopMasterLoop() {
        if (masterLoopId !== null) { cancelAnimationFrame(masterLoopId); masterLoopId = null; }
    }

    // ─────────────────────────────────────────────
    // BOT LIFECYCLE
    // ─────────────────────────────────────────────
    function startBots(action) {
        if (isStarting || isStopping) return;

        if (!keyValidated) {
            showKeyPrompt().then(ok => { if (ok) startBots(action); });
            return;
        }

        if (action !== 'start' && action !== 'stfinish') { stopBots(); return; }
        if (!cfg.server) { setTimeout(() => startBots(action), 500); return; }
        if (cfg.running) { stopBots(); setTimeout(() => startBots(action), 1000); return; }

        console.log(`🚀 ${SCRIPT_NAME} — starting ${cfg.botCount} bots`);
        isStarting = true;
        cfg.running = true;
        PbLogger.reset();
        _spawnBots();
        _startMasterLoop(); // single RAF loop for ALL bots

        const t0 = Date.now();
        stopwatchInterval = setInterval(() => {
            if (!cfg.running) { clearInterval(stopwatchInterval); return; }
            const ms = Date.now() - t0;
            const m = String(Math.floor(ms / 60000)).padStart(2, '0');
            const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
            const el = document.getElementById('pb-stopwatch');
            if (el) el.textContent = m + ':' + s;
        }, 1000);

        let tick = 0;
        botCounter = setInterval(() => {
            if (!cfg.running) return;
            tick++;
            let alive = 0, conn = 0;
            let totalMass = 0;
            const now = Date.now();

            for (let i = 0; i < bots.length; i++) {
                const b = bots[i];
                if (!b) continue;
                const isWsOpen = b.ws && b.ws.readyState === WebSocket.OPEN;

                if (b.alive && isWsOpen) {
                    alive++;
                    if (cfg.showMass && b.myCells && b.cellMap) {
                        for (let j = 0; j < b.myCells.length; j++) {
                            const c = b.cellMap[b.myCells[j]];
                            if (c && c.size) totalMass += Math.round((c.size * c.size) / 100);
                        }
                    }
                }
                if (isWsOpen) conn++;

                // Every 2.5 seconds: check respawn smoothly
                if (tick % 5 === 0) {
                    b.checkRespawn();
                }

                // Paced Auto-Heal: reconnect smoothly without flooding the IP queue
                if (tick % 6 === 0) {
                    const isDead = !isWsOpen && (!b.ws || b.ws.readyState >= 2);
                    if (isDead && !b.queued && conn < cfg.botCount) {
                        b.reconnectSafe();
                    }
                }
            }

            // Replenish missing bot instances if count ever drops below target
            if (tick % 6 === 0 && bots.length < cfg.botCount) {
                _spawnBots();
            }

            const el = document.querySelector('.pb-swarm-count');
            const massEl = document.getElementById('pb-mass');
            const st = document.getElementById('pb-status');
            if (el) el.innerHTML = `<span style="color:#34d399">${alive}</span><span style="color:#475569">/</span><span style="color:#38bdf8">${conn}</span>`;
            if (massEl) massEl.textContent = totalMass.toLocaleString();
            if (st) { st.textContent = 'LIVE'; st.className = 'pb-status live'; }

            // ── HEALTH MONITOR UPDATE ──
            const target = cfg.botCount || 150;
            const spawning = Math.max(0, conn - alive);
            const offline = Math.max(0, target - conn);
            const pct = target > 0 ? Math.min(100, Math.round((alive / target) * 100)) : 0;

            const hBar = document.getElementById('pb-health-bar');
            const hPct = document.getElementById('pb-health-pct');
            const hIcon = document.getElementById('pb-health-icon');
            const htAlive = document.getElementById('pb-ht-alive');
            const htSpawn = document.getElementById('pb-ht-spawn');
            const htOff = document.getElementById('pb-ht-off');
            const htStatus = document.getElementById('pb-ht-status');

            let hColor = '#10b981', hStatusText = 'OPTIMAL';
            if (pct < 40) { hColor = '#ef4444'; hStatusText = 'CRITICAL'; }
            else if (pct < 75) { hColor = '#f59e0b'; hStatusText = 'WARNING'; }

            if (hBar) {
                hBar.style.width = pct + '%';
                hBar.style.background = hColor;
                hBar.style.boxShadow = '0 0 8px ' + hColor;
            }
            if (hPct) {
                hPct.textContent = pct + '%';
                hPct.style.color = hColor;
            }
            if (hIcon) {
                hIcon.style.color = hColor;
            }
            if (htAlive) htAlive.textContent = alive;
            if (htSpawn) htSpawn.textContent = spawning;
            if (htOff) htOff.textContent = offline;
            if (htStatus) {
                htStatus.textContent = hStatusText;
                htStatus.style.color = hColor;
            }

            const htDrop = document.getElementById('pb-ht-drop');
            if (htDrop) htDrop.textContent = PbLogger.getTopReason();

            // Periodic Console Diagnostics Log (every 5 seconds)
            if (tick % 10 === 0) {
                console.log(
                    `%c⚡ [PHYSIC DIAGNOSTICS] Alive: ${alive}/${target} | Conn: ${conn} | Top Cause: ${PbLogger.getTopReason()} | Spawns OK: ${PbLogger.spawns} | Drops: ${PbLogger.disconnects} | Pkt18 Kicks: ${PbLogger.pkt18}`,
                    'color: #38bdf8; font-weight: bold; background: #0b0f1d; padding: 3px 8px; border-radius: 6px; border: 1px solid #1e293b;'
                );
            }
        }, 500);

        document.getElementById('pb-light')?.setAttribute('class', 'pb-dot running');
        document.getElementById('pb-stopwatch')?.style.setProperty('display', 'inline');
        isStarting = false;
    }

    function stopBots() {
        if (!cfg.running) return;
        console.log('🛑 Stopping bots...');
        isStopping = true;
        cfg.running = false;
        _stopMasterLoop(); // kill the RAF loop

        clearInterval(stopwatchInterval);
        document.getElementById('pb-light')?.setAttribute('class', 'pb-dot stopped');
        document.getElementById('pb-stopwatch')?.style.setProperty('display', 'none');
        if (document.getElementById('pb-stopwatch')) document.getElementById('pb-stopwatch').textContent = '00:00';

        clearInterval(botCounter); botCounter = null;
        PbQueue.clear();

        // INSTANT SOCKET CLEANUP: Free all sockets immediately so party switching never blocks
        while (bots.length) {
            try { bots.pop().stop(); } catch (_) {}
        }

        const el = document.querySelector('.pb-swarm-count');
        const massEl = document.getElementById('pb-mass');
        const st = document.getElementById('pb-status');
        if (el) el.textContent = cfg.botCount;
        if (massEl) massEl.textContent = '0';
        if (st) { st.textContent = 'STANDBY'; st.className = 'pb-status standby'; }

        const hBar = document.getElementById('pb-health-bar');
        const hPct = document.getElementById('pb-health-pct');
        const hIcon = document.getElementById('pb-health-icon');
        const htAlive = document.getElementById('pb-ht-alive');
        const htSpawn = document.getElementById('pb-ht-spawn');
        const htOff = document.getElementById('pb-ht-off');
        const htStatus = document.getElementById('pb-ht-status');
        if (hBar) { hBar.style.width = '0%'; hBar.style.background = '#64748b'; hBar.style.boxShadow = 'none'; }
        if (hPct) { hPct.textContent = '0%'; hPct.style.color = '#64748b'; }
        if (hIcon) { hIcon.style.color = '#64748b'; }
        if (htAlive) htAlive.textContent = '0';
        if (htSpawn) htSpawn.textContent = '0';
        if (htOff) htOff.textContent = cfg.botCount;
        if (htStatus) { htStatus.textContent = 'STANDBY'; htStatus.style.color = '#64748b'; }

        document.getElementById('pb-light')?.setAttribute('class', 'pb-dot stopped');
        isStopping = false;
    }

    function _spawnBots() {
        const target = cfg.botCount;
        while (bots.length < target) {
            const b = new Bot(cfg, bots.length);
            let modeToSet = currentMode;
            if (currentMode === 'hybrid') {
                modeToSet = bots.length < Math.floor(target / 2) ? 'tracker' : 'farmer';
            }
            b.setMode(modeToSet);
            bots.push(b);
        }
        while (bots.length > target) {
            bots.pop().stop();
        }
    }

    function setBotMode(m) {
        currentMode = m;
        if (m === 'hybrid') {
            const splitPoint = Math.floor(bots.length / 2); // 50% Tracker, 50% Farmer (Exact Half & Half)
            for (let i = 0; i < bots.length; i++) {
                bots[i].setMode(i < splitPoint ? 'tracker' : 'farmer');
            }
        } else {
            for (const b of bots) b.setMode(m);
        }
    }

    // ─────────────────────────────────────────────
    // WEBSOCKET HOOK  (capture Agar server URL & party hopping guard)
    // ─────────────────────────────────────────────
    function hookWebSocket() {
        const BLOCKED = ['delt.io','ixagar','glitch','socket.io','firebase','agartool.io','herokuapp','localhost'];

        if (!WebSocket.prototype._pbSend) {
            WebSocket.prototype._pbSend = WebSocket.prototype.send;
            WebSocket.prototype.send = function (data) {
                if (!this._pbBot && this.url && !BLOCKED.some(s => this.url.includes(s))) {
                    if (this.url.includes('miniclippt.com')) {
                        if (cfg.server !== this.url) {
                            const old = cfg.server;
                            cfg.server = this.url;
                            if (old && old !== this.url && cfg.running) {
                                console.log('🔄 Player switched party room! Migrating bots to new arena...');
                                stopBots();
                                setTimeout(() => { if (!cfg.running) startBots('stfinish'); }, 800);
                            }
                        }
                    }
                }
                return WebSocket.prototype._pbSend.call(this, data);
            };
        }

        if (!window._pbWsHooked) {
            window._pbWsHooked = true;
            const OrigWS = window.WebSocket;
            window.WebSocket = function (url, protocols) {
                const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
                const isBlocked = BLOCKED.some(s => typeof url === 'string' && url.includes(s));
                if (!isBlocked && typeof url === 'string' && url.includes('miniclippt.com')) {
                    ws.addEventListener('close', () => {
                        if (!ws._pbBot && cfg.running) {
                            console.log('🔌 Player left room. Freeing sockets so next party connects instantly!');
                            stopBots();
                        }
                    });
                }
                return ws;
            };
            window.WebSocket.prototype = OrigWS.prototype;
            for (const prop of Object.getOwnPropertyNames(OrigWS)) {
                if (!(prop in window.WebSocket)) {
                    try { window.WebSocket[prop] = OrigWS[prop]; } catch (_) {}
                }
            }
        }
    }

    // ─────────────────────────────────────────────
    // MOUSE SYNC
    // ─────────────────────────────────────────────
    function startMouseSync() {
        setInterval(() => {
            try {
                if (window.__pb) {
                    const x = window.__pb.getX(), y = window.__pb.getY();
                    if (isFinite(x) && Math.abs(x) < 50000) { cfg.mouseX = x; cfg.mouseY = y; }
                }
            } catch (_) {}
        }, 33);
    }

    // ─────────────────────────────────────────────
    // UI
    // ─────────────────────────────────────────────
    function buildUI() {
        const style = document.createElement('style');
        style.textContent = `
        /* ============================================================ */
        /* CYBER OBSIDIAN DOCK & MATRIX UI                              */
        /* ============================================================ */
        @keyframes pb-pulse-glow {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
            70% { box-shadow: 0 0 0 7px rgba(16, 185, 129, 0); }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes pb-border-sheen {
            0% { border-color: rgba(56, 189, 248, 0.25); }
            50% { border-color: rgba(168, 85, 247, 0.35); }
            100% { border-color: rgba(56, 189, 248, 0.25); }
        }

        .pb-panel {
            position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
            z-index: 99999999; display: flex; align-items: center; gap: 7px;
            background: linear-gradient(135deg, rgba(11, 15, 29, 0.96) 0%, rgba(6, 9, 18, 0.94) 100%);
            border: 1px solid rgba(56, 189, 248, 0.25);
            border-radius: 24px;
            padding: 5px 8px 5px 10px;
            backdrop-filter: blur(28px) saturate(200%);
            -webkit-backdrop-filter: blur(28px) saturate(200%);
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85),
                        0 0 1px 1px rgba(255, 255, 255, 0.09),
                        inset 0 1px 0 rgba(255, 255, 255, 0.14),
                        0 0 25px rgba(14, 165, 233, 0.12);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none; pointer-events: auto;
            animation: pb-border-sheen 8s infinite ease-in-out;
        }
        .pb-panel.hidden {
            opacity: 0; pointer-events: none;
            transform: scale(0.92) translateY(-15px) !important;
        }

        /* Draggable grip */
        .pb-grip {
            color: rgba(255, 255, 255, 0.22);
            font-size: 13px; letter-spacing: -2px; cursor: grab;
            display: flex; align-items: center; padding: 0 2px 0 0;
            transition: color 0.2s;
        }
        .pb-grip:hover { color: #38bdf8; }
        .pb-panel.dragging { cursor: grabbing !important; }
        .pb-panel.dragging * { cursor: grabbing !important; }

        /* Brand Pill */
        .pb-brand-pill {
            display: flex; align-items: center; gap: 6px;
            padding: 3px 8px; border-radius: 12px;
            background: rgba(14, 165, 233, 0.1);
            border: 1px solid rgba(56, 189, 248, 0.25);
            cursor: grab;
        }
        .pb-brand-icon {
            color: #38bdf8; font-size: 13px;
            filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.9));
        }
        .pb-brand-title {
            color: #f8fafc; font-size: 11px; font-weight: 900; letter-spacing: 1.2px;
            text-transform: uppercase; text-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
        }
        .pb-brand-badge {
            background: linear-gradient(135deg, #0284c7, #7c3aed);
            color: #ffffff; font-size: 8px; font-weight: 900;
            padding: 1px 4px; border-radius: 6px; letter-spacing: 0.5px;
        }

        /* Live indicator */
        .pb-live-chip {
            display: flex; align-items: center; gap: 6px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 14px; padding: 4px 8px;
        }
        .pb-dot {
            width: 7px; height: 7px; border-radius: 50%; display: inline-block;
        }
        .pb-dot.running {
            background: #10b981; box-shadow: 0 0 8px #10b981;
            animation: pb-pulse-glow 1.8s infinite;
        }
        .pb-dot.stopped {
            background: #f59e0b; box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
        }

        .pb-status {
            font-size: 10px; font-weight: 900; letter-spacing: 0.6px;
            color: #64748b; font-family: monospace; text-transform: uppercase;
        }
        .pb-status.live { color: #34d399; }
        .pb-status.standby { color: #fbbf24; }

        #pb-stopwatch {
            color: #38bdf8; font-size: 10px; font-weight: 800;
            font-family: monospace; display: none;
            padding-left: 5px; border-left: 1px solid rgba(255, 255, 255, 0.12);
        }

        /* Swarm readout */
        .pb-swarm-badge {
            display: inline-flex; align-items: center; gap: 5px;
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 14px; padding: 4px 10px;
            color: #94a3b8; font-size: 10px; font-weight: 800; letter-spacing: 0.4px;
        }
        .pb-swarm-count {
            color: #38bdf8; font-weight: 900; font-family: monospace;
            font-size: 11px; display: inline-flex; align-items: baseline;
        }
        .pb-vsep {
            width: 1px; height: 10px; background: rgba(255, 255, 255, 0.12);
            margin: 0 2px;
        }
        .pb-mass-count {
            color: #34d399; font-weight: 900; font-family: monospace;
            font-size: 11px; display: inline-flex; align-items: baseline;
            text-shadow: 0 0 8px rgba(52, 211, 153, 0.4);
        }
        #pb-mass-wrap {
            display: inline-flex; align-items: center; gap: 5px;
        }

        /* Health Monitor HUD & Tooltip */
        .pb-health-chip {
            display: inline-flex; align-items: center; gap: 6px;
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 14px; padding: 4px 9px;
            position: relative; cursor: default;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .pb-health-chip:hover {
            background: rgba(0, 0, 0, 0.6);
            border-color: rgba(56, 189, 248, 0.35);
        }
        .pb-health-icon {
            color: #64748b;
            transition: color 0.3s;
            filter: drop-shadow(0 0 4px currentColor);
            flex-shrink: 0;
        }
        .pb-health-bar-track {
            width: 36px; height: 5px; background: rgba(255, 255, 255, 0.08);
            border-radius: 4px; overflow: hidden; position: relative;
        }
        .pb-health-bar-fill {
            height: 100%; width: 0%; border-radius: 4px;
            background: #64748b;
            box-shadow: none;
            transition: width 0.35s ease, background 0.35s ease, box-shadow 0.35s ease;
        }
        .pb-health-pct {
            font-size: 10px; font-weight: 900; font-family: monospace;
            color: #64748b; min-width: 26px; text-align: right;
            transition: color 0.3s;
        }
        .pb-health-tooltip {
            position: absolute; top: calc(100% + 8px); left: 50%;
            transform: translateX(-50%) translateY(-4px);
            background: linear-gradient(145deg, rgba(12, 16, 32, 0.98) 0%, rgba(6, 9, 20, 0.96) 100%);
            border: 1px solid rgba(56, 189, 248, 0.3);
            border-radius: 14px; padding: 10px 14px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.9), 0 0 20px rgba(14, 165, 233, 0.15);
            font-size: 10px; white-space: nowrap; pointer-events: none;
            opacity: 0; transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 10000000; display: flex; flex-direction: column; gap: 5px; min-width: 155px;
            backdrop-filter: blur(20px);
        }
        .pb-health-chip:hover .pb-health-tooltip {
            opacity: 1; transform: translateX(-50%) translateY(0);
        }
        .pb-ht-title {
            font-size: 9px; font-weight: 900; letter-spacing: 1px; color: #38bdf8;
            text-transform: uppercase; padding-bottom: 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            text-align: center;
        }
        .pb-ht-row {
            display: flex; align-items: center; justify-content: space-between; gap: 14px;
        }
        .pb-ht-label { color: #94a3b8; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
        .pb-ht-val { font-family: monospace; font-weight: 900; font-size: 10px; }

        /* Power Controls */
        .pb-controls {
            display: flex; align-items: center; gap: 5px;
        }
        .pb-action-btn {
            height: 28px; padding: 0 13px; border-radius: 14px;
            font-size: 10px; font-weight: 900; letter-spacing: 0.7px;
            cursor: pointer; border: none; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1); font-family: inherit;
        }
        .pb-action-btn:active { transform: scale(0.94); }

        .pb-btn-start {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: #ffffff;
            box-shadow: 0 2px 12px rgba(16, 185, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        .pb-btn-start:hover {
            background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
            box-shadow: 0 0 18px rgba(52, 211, 153, 0.6);
            transform: translateY(-1px);
        }
        .pb-btn-stop {
            background: rgba(239, 68, 68, 0.15); color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.35);
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2);
        }
        .pb-btn-stop:hover {
            background: #ef4444; color: #fff; border-color: #ef4444;
            box-shadow: 0 0 16px rgba(239, 68, 68, 0.55);
            transform: translateY(-1px);
        }

        /* Mode Selector Segment */
        .pb-segment {
            display: flex; align-items: center;
            background: rgba(0, 0, 0, 0.45);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 16px; padding: 2px; gap: 2px;
        }
        .pb-seg-item {
            height: 24px; padding: 0 9px; border-radius: 12px;
            font-size: 10px; font-weight: 800; cursor: pointer;
            background: transparent; border: none; color: #94a3b8;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); font-family: inherit;
        }
        .pb-seg-item:hover { color: #ffffff; background: rgba(255, 255, 255, 0.06); }
        .pb-seg-item.t-on {
            background: #0ea5e9 !important; color: #fff !important;
            box-shadow: 0 2px 10px rgba(14, 165, 233, 0.5);
        }
        .pb-seg-item.f-on {
            background: #10b981 !important; color: #fff !important;
            box-shadow: 0 2px 10px rgba(16, 185, 129, 0.5);
        }
        .pb-seg-item.h-on {
            background: linear-gradient(135deg, #8b5cf6, #ec4899) !important; color: #fff !important;
            box-shadow: 0 2px 10px rgba(139, 92, 246, 0.5);
        }

        /* Utility buttons */
        .pb-icon-btn {
            width: 28px; height: 28px; border-radius: 10px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #94a3b8; display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: all 0.2s ease; font-size: 12px;
        }
        .pb-icon-btn:hover {
            background: rgba(56, 189, 248, 0.15); color: #38bdf8;
            border-color: rgba(56, 189, 248, 0.4);
            transform: scale(1.06);
        }

        /* Show Dock Button */
        #pb-showbtn {
            position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 99999998;
            background: rgba(11, 15, 29, 0.95); border: 1px solid #0ea5e9; color: #38bdf8; font-size: 10px; font-weight: 900;
            padding: 7px 20px; border-radius: 20px; cursor: pointer; display: none;
            letter-spacing: 1.5px; text-transform: uppercase; box-shadow: 0 0 20px rgba(14, 165, 233, 0.5);
            backdrop-filter: blur(16px);
        }

        /* ============================================================ */
        /* CYBER MATRIX SETTINGS MODAL                                  */
        /* ============================================================ */
        #pb-settings {
            position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(145deg, rgba(13, 17, 34, 0.98) 0%, rgba(7, 10, 22, 0.96) 100%);
            padding: 24px;
            border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 24px;
            z-index: 100000000; color: #fff; width: 360px;
            box-shadow: 0 25px 70px rgba(0, 0, 0, 0.9), 0 0 35px rgba(14, 165, 233, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.12);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            backdrop-filter: blur(36px);
        }
        .pb-mheader {
            display: flex; align-items: center; justify-content: space-between;
            padding-bottom: 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 16px;
        }
        .pb-mtitle-wrap { display: flex; align-items: center; gap: 8px; }
        .pb-micon {
            font-size: 16px; color: #38bdf8; filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.8));
        }
        .pb-mtitle {
            font-size: 13px; font-weight: 900; letter-spacing: 1.4px; color: #f8fafc; text-transform: uppercase;
        }
        .pb-msub {
            font-size: 9px; font-weight: 700; color: #64748b; letter-spacing: 0.8px; text-transform: uppercase;
        }
        .pb-mclose {
            background: transparent; border: none; color: #64748b; font-size: 16px; cursor: pointer;
            padding: 4px 8px; border-radius: 8px; transition: all 0.15s;
        }
        .pb-mclose:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }

        .pb-sgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pb-slabel {
            margin: 0 0 6px; font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px;
        }
        .pb-sinput {
            width: 100%; padding: 8px 12px; background: #12182b !important;
            border: 1px solid #232d47; color: #ffffff !important; border-radius: 10px;
            font-size: 12px; box-sizing: border-box; font-weight: 700; outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .pb-sinput:focus {
            border-color: #38bdf8;
            box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
        }
        select.pb-sinput {
            cursor: pointer;
            appearance: none; -webkit-appearance: none;
            background-image: url("data:image/svg+xml;utf8,<svg fill='%2338bdf8' height='18' viewBox='0 0 24 24' width='18' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/></svg>");
            background-repeat: no-repeat;
            background-position: right 10px center;
            padding-right: 32px;
        }

        /* Preset pills for bot count */
        .pb-presets {
            display: flex; gap: 4px; margin-top: 6px;
        }
        .pb-preset-btn {
            flex: 1; height: 22px; background: #161f36; border: 1px solid #232f50;
            color: #94a3b8; border-radius: 6px; font-size: 9px; font-weight: 800;
            cursor: pointer; transition: all 0.15s; font-family: monospace;
        }
        .pb-preset-btn:hover {
            background: #0284c7; color: #fff; border-color: #38bdf8;
        }

        /* Animated Toggle Switch */
        .pb-toggle-row {
            display: flex; align-items: center; justify-content: space-between;
            background: #12182b; padding: 10px 14px; border-radius: 12px; border: 1px solid #232d47;
            margin-top: 12px; cursor: pointer;
        }
        .pb-toggle-label {
            font-size: 11px; font-weight: 700; color: #cbd5e1;
        }
        .pb-switch {
            position: relative; display: inline-block; width: 38px; height: 22px; cursor: pointer;
        }
        .pb-switch input { opacity: 0; width: 0; height: 0; }
        .pb-slider {
            position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
            background: #232d47; transition: 0.25s; border-radius: 22px;
        }
        .pb-slider:before {
            position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px;
            background-color: white; transition: 0.25s; border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        }
        .pb-switch input:checked + .pb-slider {
            background: linear-gradient(135deg, #0ea5e9, #0284c7);
            box-shadow: 0 0 10px rgba(14, 165, 233, 0.5);
        }
        .pb-switch input:checked + .pb-slider:before {
            transform: translateX(16px);
        }

        /* Keycaps Grid */
        .pb-kbgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px; }
        .pb-kbcell {
            background: #12182b; border: 1px solid #232d47; border-radius: 10px; padding: 6px 4px;
            display: flex; flex-direction: column; align-items: center; gap: 4px;
        }
        .pb-kblabel { color: #64748b; font-size: 9px; font-weight: 800; text-transform: uppercase; }
        .pb-kbcap {
            width: 32px; height: 26px; background: linear-gradient(180deg, #1e2942 0%, #111728 100%);
            border: 1px solid #38bdf8; border-bottom: 2px solid #0284c7;
            border-radius: 6px; color: #38bdf8; font-size: 12px; font-weight: 900;
            text-align: center; line-height: 24px; font-family: monospace; outline: none;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .pb-ssave {
            background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
            color: #fff; border: none; padding: 12px;
            cursor: pointer; border-radius: 12px; font-size: 11px; font-weight: 900;
            width: 100%; margin-top: 18px; text-transform: uppercase; letter-spacing: 1.2px;
            box-shadow: 0 4px 18px rgba(14, 165, 233, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2);
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .pb-ssave:hover {
            background: linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%);
            box-shadow: 0 0 25px rgba(56, 189, 248, 0.7);
            transform: translateY(-1px);
        }
        `;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.className = 'pb-panel';
        panel.id = 'pb-panel';

        // Restore saved position if available
        const savedLeft = localStorage.getItem(STORAGE_PREFIX + 'panel_left');
        const savedTop  = localStorage.getItem(STORAGE_PREFIX + 'panel_top');
        if (savedLeft && savedTop) {
            panel.style.left = savedLeft;
            panel.style.top = savedTop;
            panel.style.transform = 'none';
        }

        panel.innerHTML = `
            <div class="pb-grip" title="Drag Dock">⋮⋮</div>

            <div class="pb-brand-pill" title="Drag Dock">
                <span class="pb-brand-icon">⚡</span>
                <span class="pb-brand-title">PHYSIC</span>
                <span class="pb-brand-badge">V2</span>
            </div>

            <div class="pb-live-chip">
                <span class="pb-dot stopped" id="pb-light"></span>
                <span class="pb-status standby" id="pb-status">STANDBY</span>
                <span id="pb-stopwatch">00:00</span>
            </div>

            <div class="pb-swarm-badge">
                <span>BOTS</span>
                <span class="pb-swarm-count" id="pb-swarm">${cfg.botCount}</span>
                <span id="pb-mass-wrap" style="display:${cfg.showMass ? 'inline-flex' : 'none'};">
                    <span class="pb-vsep"></span>
                    <span>MASS</span>
                    <span class="pb-mass-count" id="pb-mass">0</span>
                </span>
            </div>

            <div class="pb-health-chip" id="pb-health-chip" title="Bot Health Monitor">
                <svg class="pb-health-icon" id="pb-health-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
                <div class="pb-health-bar-track">
                    <div class="pb-health-bar-fill" id="pb-health-bar"></div>
                </div>
                <span class="pb-health-pct" id="pb-health-pct">0%</span>
                <div class="pb-health-tooltip">
                    <div class="pb-ht-title">BOT HEALTH MONITOR</div>
                    <div class="pb-ht-row"><span class="pb-ht-label">Active Cells</span><span class="pb-ht-val" id="pb-ht-alive" style="color:#10b981">0</span></div>
                    <div class="pb-ht-row"><span class="pb-ht-label">Spawning</span><span class="pb-ht-val" id="pb-ht-spawn" style="color:#f59e0b">0</span></div>
                    <div class="pb-ht-row"><span class="pb-ht-label">Offline</span><span class="pb-ht-val" id="pb-ht-off" style="color:#ef4444">${cfg.botCount}</span></div>
                    <div class="pb-ht-row"><span class="pb-ht-label">Top Drop</span><span class="pb-ht-val" id="pb-ht-drop" style="color:#f87171">None</span></div>
                    <div class="pb-ht-row" style="margin-top:2px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.08);"><span class="pb-ht-label">Status</span><span class="pb-ht-val" id="pb-ht-status" style="color:#64748b">STANDBY</span></div>
                </div>
            </div>

            <div class="pb-controls">
                <button class="pb-action-btn pb-btn-start" id="pb-start">▶ START</button>
                <button class="pb-action-btn pb-btn-stop"  id="pb-stop">■ STOP</button>
            </div>

            <div class="pb-segment">
                <button class="pb-seg-item t-on" id="pb-tracker">Tracker</button>
                <button class="pb-seg-item"      id="pb-hybrid">Hybrid</button>
                <button class="pb-seg-item"      id="pb-farmer">Farmer</button>
            </div>

            <button class="pb-icon-btn" id="pb-cfg" title="Settings">⚙</button>
            <button class="pb-icon-btn" id="pb-hide" title="Hide Dock">✕</button>
        `;
        document.body.appendChild(panel);

        const showBtn = document.createElement('button');
        showBtn.id = 'pb-showbtn'; showBtn.textContent = '⚡ OPEN PHYSIC';
        showBtn.onclick = () => { panel.classList.remove('hidden'); showBtn.style.display = 'none'; };
        document.body.appendChild(showBtn);

        // ── DRAGGABLE LOGIC ──────────────────────────────
        let isDragging = false, startX = 0, startY = 0, initLeft = 0, initTop = 0;
        panel.addEventListener('mousedown', e => {
            if (e.target.closest('button, input, select, .pb-seg-item, .pb-switch')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const r = panel.getBoundingClientRect();
            initLeft = r.left;
            initTop = r.top;
            panel.classList.add('dragging');
            panel.style.transition = 'none';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const nLeft = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, initLeft + dx));
            const nTop  = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, initTop + dy));
            panel.style.left = nLeft + 'px';
            panel.style.top  = nTop + 'px';
            panel.style.transform = 'none';
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                panel.classList.remove('dragging');
                panel.style.transition = '';
                document.body.style.userSelect = '';
                localStorage.setItem(STORAGE_PREFIX + 'panel_left', panel.style.left);
                localStorage.setItem(STORAGE_PREFIX + 'panel_top', panel.style.top);
            }
        });

        // ── EVENTS ───────────────────────────────────────
        document.getElementById('pb-start').onclick = () => startBots('stfinish');
        document.getElementById('pb-stop').onclick = () => startBots('stop');

        function updateModeUI(active) {
            document.getElementById('pb-tracker').className = 'pb-seg-item' + (active === 'tracker' ? ' t-on' : '');
            document.getElementById('pb-hybrid').className  = 'pb-seg-item' + (active === 'hybrid'  ? ' h-on' : '');
            document.getElementById('pb-farmer').className  = 'pb-seg-item' + (active === 'farmer'  ? ' f-on' : '');
        }

        document.getElementById('pb-tracker').onclick = () => { setBotMode('tracker'); updateModeUI('tracker'); };
        document.getElementById('pb-hybrid').onclick  = () => { setBotMode('hybrid');  updateModeUI('hybrid');  };
        document.getElementById('pb-farmer').onclick  = () => { setBotMode('farmer');  updateModeUI('farmer');  };

        document.getElementById('pb-hide').onclick = () => {
            const hidden = panel.classList.toggle('hidden');
            showBtn.style.display = hidden ? 'block' : 'none';
        };

        document.getElementById('pb-cfg').onclick = () => {
            const m = document.getElementById('pb-settings');
            if (m) { saveSettings(); m.remove(); } else buildSettings();
        };
    }

    function buildSettings() {
        const kb = cfg.keybinds;
        const el = document.createElement('div');
        el.id = 'pb-settings';
        el.innerHTML = `
            <div class="pb-mheader">
                <div class="pb-mtitle-wrap">
                    <span class="pb-micon">⚡</span>
                    <div>
                        <div class="pb-mtitle">PHYSIC MATRIX</div>
                        <div class="pb-msub">BOTNET SYSTEM CONTROL</div>
                    </div>
                </div>
                <button class="pb-mclose" id="pb-sclose">✕</button>
            </div>

            <div class="pb-sgrid">
                <div>
                    <div class="pb-slabel">Bot Name</div>
                    <input id="s-name" class="pb-sinput" value="${localStorage.getItem(STORAGE_PREFIX + 'bot_name') || 'PhysicBot'}">
                </div>
                <div>
                    <div class="pb-slabel">Bot Count</div>
                    <input id="s-qty" type="number" min="1" max="200" class="pb-sinput" value="${cfg.botCount}">
                    <div class="pb-presets">
                        <button type="button" class="pb-preset-btn" data-v="50">50</button>
                        <button type="button" class="pb-preset-btn" data-v="100">100</button>
                        <button type="button" class="pb-preset-btn" data-v="150">150</button>
                        <button type="button" class="pb-preset-btn" data-v="200">200</button>
                    </div>
                </div>
            </div>

            <div style="margin-top:14px;">
                <div class="pb-slabel">Bot Appearance</div>
                <select id="s-skin-mode" class="pb-sinput">
                    <option value="random"  ${cfg.skinMode === 'random'  ? 'selected' : ''}>Random Mix (Agar.io Native Skins)</option>
                    <option value="default" ${cfg.skinMode === 'default' ? 'selected' : ''}>Default Bot Name</option>
                </select>
            </div>

            <div class="pb-toggle-row" onclick="document.getElementById('s-show-mass').click()">
                <span class="pb-toggle-label">Show Bot Mass Counter</span>
                <label class="pb-switch" onclick="event.stopPropagation()">
                    <input type="checkbox" id="s-show-mass" ${cfg.showMass ? 'checked' : ''}>
                    <span class="pb-slider"></span>
                </label>
            </div>

            <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);">
                <div class="pb-slabel">Tactical Keybinds</div>
                <div class="pb-kbgrid">
                    <div class="pb-kbcell"><span class="pb-kblabel">Split</span> <input maxlength="1" id="kb-split" class="pb-kbcap" value="${kb.split}"></div>
                    <div class="pb-kbcell"><span class="pb-kblabel">Feed</span> <input maxlength="1" id="kb-feed" class="pb-kbcap" value="${kb.feed}"></div>
                    <div class="pb-kbcell"><span class="pb-kblabel">Tracker</span> <input maxlength="1" id="kb-tracker" class="pb-kbcap" value="${kb.tracker}"></div>
                    <div class="pb-kbcell"><span class="pb-kblabel">Hybrid</span> <input maxlength="1" id="kb-hybrid" class="pb-kbcap" value="${kb.hybrid}"></div>
                    <div class="pb-kbcell"><span class="pb-kblabel">Farmer</span> <input maxlength="1" id="kb-farmer" class="pb-kbcap" value="${kb.farmer}"></div>
                    <div class="pb-kbcell"><span class="pb-kblabel">Hide</span> <input maxlength="1" id="kb-hide" class="pb-kbcap" value="${kb.hide}"></div>
                </div>
            </div>

            <button class="pb-ssave" id="pb-save">Save & Apply Matrix</button>
        `;
        document.body.appendChild(el);

        // Presets click
        el.querySelectorAll('.pb-preset-btn').forEach(btn => {
            btn.onclick = () => {
                const q = document.getElementById('s-qty');
                if (q) q.value = btn.getAttribute('data-v');
            };
        });

        // Close button
        document.getElementById('pb-sclose').onclick = () => el.remove();

        // Keycaps inputs
        el.querySelectorAll('.pb-kbcap').forEach(inp => {
            inp.addEventListener('focus', () => inp.select());
            inp.addEventListener('keydown', e => {
                if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) { inp.value = e.key.toUpperCase(); e.preventDefault(); }
            });
        });

        document.getElementById('pb-save').onclick = () => { saveSettings(); el.remove(); };
    }

    function saveSettings() {
        const name = (document.getElementById('s-name')?.value.trim()) || 'PhysicBot';
        let qty = parseInt(document.getElementById('s-qty')?.value);
        if (!qty || qty < 1) qty = 150; if (qty > 200) qty = 200;

        const skinMode = document.getElementById('s-skin-mode')?.value || 'random';
        const showMass = document.getElementById('s-show-mass') ? document.getElementById('s-show-mass').checked : true;

        cfg.botCount = qty;
        cfg.skinMode = skinMode;
        cfg.showMass = showMass;

        localStorage.setItem(STORAGE_PREFIX + 'bot_name', name);
        localStorage.setItem(STORAGE_PREFIX + 'bot_qty', qty);
        localStorage.setItem(STORAGE_PREFIX + 'skin_mode', skinMode);
        localStorage.setItem(STORAGE_PREFIX + 'show_mass', showMass);

        const massWrap = document.getElementById('pb-mass-wrap');
        if (massWrap) massWrap.style.display = showMass ? 'inline-flex' : 'none';

        const kbMap = { split:'kb-split', feed:'kb-feed', tracker:'kb-tracker', hybrid:'kb-hybrid', farmer:'kb-farmer', hide:'kb-hide' };
        for (const [k, id] of Object.entries(kbMap)) {
            const v = document.getElementById(id)?.value.trim().toUpperCase();
            if (v) cfg.keybinds[k] = v;
        }

        for (const b of bots) b.name = name;
        if (!cfg.running) { const sw = document.getElementById('pb-swarm'); if (sw) sw.textContent = qty; }
        _spawnBots();
    }

    // ─────────────────────────────────────────────
    // KEYBOARD
    // ─────────────────────────────────────────────
    function hookKeys() {
        document.addEventListener('keydown', e => {
            const t = e.target.tagName;
            if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
            if (document.getElementById('pb-key-overlay')) return;
            const k = e.key.toUpperCase(), kb = cfg.keybinds;
            if (k === kb.tracker) { document.getElementById('pb-tracker')?.click(); e.preventDefault(); }
            else if (k === kb.hybrid) { document.getElementById('pb-hybrid')?.click(); e.preventDefault(); }
            else if (k === kb.farmer) { document.getElementById('pb-farmer')?.click(); e.preventDefault(); }
            else if (k === kb.feed) { for (const b of bots) if (b.mode === 'tracker') b.eject(); e.preventDefault(); }
            else if (k === kb.split) { for (const b of bots) if (b.mode === 'tracker') b.split(); e.preventDefault(); }
            else if (k === kb.hide) { document.getElementById('pb-hide')?.click(); e.preventDefault(); }
        });
    }

    // ─────────────────────────────────────────────
    // BOOT
    // ─────────────────────────────────────────────
    function init() {
        if (document.getElementById('pb-panel')) return; // guard double-init
        console.log(`⚡ ${SCRIPT_NAME} — init`);
        buildUI();
        hookKeys();
        injectMouseBridge();
        waitForBridge(() => {});
        hookWebSocket();
        startMouseSync();
        // Tab visibility optimizer - throttle in background to avoid memory/CPU spikes
        document.addEventListener('visibilitychange', () => {
            window.__pbBackground = document.hidden;
        });
        window._pbStart = startBots;
        console.log(`✅ ${SCRIPT_NAME} ready — F=Tracker | C=Hybrid | V=Farmer | E=Split | R=Feed | H=Hide`);
    }

    hookWebSocket();
    if (/agar\.io/.test(location.hostname)) {
        if (document.readyState === 'complete') init();
        else document.addEventListener('DOMContentLoaded', init);
        setTimeout(init, 3000); // fallback
    }

})();
