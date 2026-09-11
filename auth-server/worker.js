// ============================================================================
// Cloudflare Worker: PhysicBot License Server (Stateless HMAC Cryptographic Keys)
// Deployment URL: https://physicbot-auth.smgeng08.workers.dev
// ============================================================================

const ADMIN_SECRET = "physic2026";

// Permanent / VIP Licenses (Valid indefinitely)
const PERMANENT_KEYS = {
  "PHYSIC-7F89-K2M4-X9VQ": { username: "Tester", role: "VIP" },
  "PHYSIC-9N42-V8KT-3ZWL": { username: "VIP", role: "VIP" },
  "PHYSIC-4T68-M1Q9-7PXZ": { username: "Pro", role: "VIP" },
  "PHYSIC-8L35-W7NK-2YQ6": { username: "God", role: "VIP" },
  "PHYSIC-2K97-4V8P-9TR3": { username: "King", role: "VIP" },
  "PHYSIC-6X14-Q8ZT-5MN2": { username: "Queen", role: "VIP" },
  "PHYSIC-3W98-L2KV-7RP4": { username: "Legend", role: "VIP" },
  "PHYSIC-5P72-N9XT-4MK8": { username: "Ultra", role: "VIP" },
  "PHYSIC-1Z84-V3WL-8TQ6": { username: "Mega", role: "VIP" },
  "PHYSIC-7M29-K8RP-3NX5": { username: "Alpha", role: "VIP" },
  "PHYSIC-4V53-T9ZQ-6KL2": { username: "Beta", role: "VIP" },
  "PHYSIC-8Q61-X4NV-2TW9": { username: "Ninja", role: "VIP" },
  "PHYSIC-2N87-P5MR-9ZK4": { username: "Master", role: "VIP" },
  "PHYSIC-6T42-W8LK-7VQ1": { username: "Zeus", role: "VIP" },
  "PHYSIC-9K38-V2QP-4NX7": { username: "Titan", role: "VIP" }
};

// ── CRYPTOGRAPHIC HMAC SIGNING & VERIFICATION ───────────────────────
async function getCryptoKey() {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(ADMIN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function createSignedTrialKey(durationMinutes = 60) {
  const enc = new TextEncoder();
  const key = await getCryptoKey();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (durationMinutes * 60);
  const expHex = exp.toString(16).toUpperCase().padStart(8, "0");
  
  // 4-character random salt
  const saltChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let salt = "";
  for (let i = 0; i < 4; i++) salt += saltChars.charAt(Math.floor(Math.random() * saltChars.length));
  
  const msg = enc.encode(expHex + ":" + salt);
  const sigBuf = await crypto.subtle.sign("HMAC", key, msg);
  const sigHex = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .substring(0, 4);

  // Format: PHYSIC-TR-XXXX-XXXX-SALT-SIG4
  return {
    key: `PHYSIC-TR-${expHex.substring(0, 4)}-${expHex.substring(4, 8)}-${salt}-${sigHex}`,
    expiresAt: exp * 1000,
    durationMinutes
  };
}

async function verifySignedTrialKey(keyString) {
  keyString = (keyString || "").replace(/\s+/g, "").toUpperCase();
  if (!keyString.startsWith("PHYSIC-TR-")) return { valid: false, message: "❌ Invalid key format" };
  const clean = keyString.replace("PHYSIC-TR-", "");
  const parts = clean.split("-").filter(Boolean);
  if (parts.length !== 4) {
    return { valid: false, message: "❌ This is an old key format. Please generate a new key from the dashboard." };
  }

  const expHex = parts[0] + parts[1];
  const salt = parts[2];
  const providedSig = parts[3];

  if (expHex.length !== 8) return { valid: false, message: "Invalid key data" };

  const enc = new TextEncoder();
  const key = await getCryptoKey();
  const msg = enc.encode(expHex + ":" + salt);
  const sigBuf = await crypto.subtle.sign("HMAC", key, msg);
  const computedSig = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .substring(0, 4);

  if (computedSig !== providedSig) {
    return { valid: false, message: "❌ Invalid or forged key signature" };
  }

  const expSeconds = parseInt(expHex, 16);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (nowSeconds >= expSeconds) {
    return { valid: false, expired: true, message: "⏳ 1-Hour Trial has expired!" };
  }

  const remainingSeconds = expSeconds - nowSeconds;
  return {
    valid: true,
    isTrial: true,
    expiresAt: expSeconds * 1000,
    remainingSeconds
  };
}

// ── MAIN DISPATCHER ──────────────────────────────────────────────────
export default {
  async fetch(request) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ── ADMIN WEB DASHBOARD ──────────────────────────────────────────
    if (url.pathname === "/admin") {
      const secret = url.searchParams.get("secret");
      if (secret !== ADMIN_SECRET) {
        return new Response("Unauthorized. Access with ?secret=YOUR_SECRET", { status: 401 });
      }
      return handleAdminDashboard();
    }

    // ── ADMIN API: GENERATE TRIAL KEY ────────────────────────────────
    if (url.pathname === "/api/generate" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const secret = authHeader.replace("Bearer ", "").trim() || url.searchParams.get("secret");
      if (secret !== ADMIN_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let body = {};
      try { body = await request.json(); } catch (_) {}
      const duration = Number(body.durationMinutes) || 75; // default 75 mins (60m + 15m buffer)
      const res = await createSignedTrialKey(duration);

      return new Response(JSON.stringify({ success: true, ...res }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── VALIDATION & HEARTBEAT ENDPOINT ──────────────────────────────
    if (request.method === "POST" && (url.pathname === "/" || url.pathname === "/api/verify")) {
      try {
        const body = await request.json();
        const rawKey = body?.key;

        if (!rawKey) {
          return new Response(JSON.stringify({ valid: false, message: "No key provided" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const key = rawKey.replace(/\s+/g, "").toUpperCase();

        // 1. Check Permanent / VIP Keys
        if (PERMANENT_KEYS[key]) {
          const user = PERMANENT_KEYS[key];
          return new Response(JSON.stringify({
            valid: true,
            isTrial: false,
            username: user.username,
            role: user.role,
            token: "VIP_" + Math.random().toString(36).substring(2)
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // 2. Check Cryptographically Signed Trial Keys
        if (key.startsWith("PHYSIC-TR-")) {
          const trialResult = await verifySignedTrialKey(key);
          if (!trialResult.valid) {
            return new Response(JSON.stringify({
              valid: false,
              expired: trialResult.expired || false,
              message: trialResult.message
            }), {
              status: trialResult.expired ? 403 : 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          return new Response(JSON.stringify({
            valid: true,
            isTrial: true,
            username: "Trial User",
            expiresAt: trialResult.expiresAt,
            remainingSeconds: trialResult.remainingSeconds,
            token: "TR_" + Math.random().toString(36).substring(2)
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          valid: false,
          message: "❌ Invalid license key"
        }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ valid: false, message: "Server error: " + err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({
      status: "online",
      server: "PhysicBot Auth Server v3.0 (Cryptographic HMAC)",
      endpoints: ["POST / (verify)", "GET /admin?secret=..."]
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};

// ── HTML ADMIN DASHBOARD ─────────────────────────────────────────────
async function handleAdminDashboard() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>⚡ PhysicBot License Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090d16; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
      display: flex; justify-content: center; padding: 30px 15px; min-height: 100vh;
    }
    .wrap { width: 100%; max-width: 650px; display: flex; flex-direction: column; gap: 20px; }
    .card {
      background: #0f172a; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
      padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    h1 { font-size: 20px; color: #38bdf8; display: flex; align-items: center; gap: 8px; font-weight: 900; }
    p { color: #94a3b8; font-size: 13px; margin-top: 6px; }
    .btn {
      background: linear-gradient(135deg, #0284c7, #0369a1); color: white; border: none;
      padding: 12px 20px; border-radius: 10px; font-weight: 800; font-size: 14px;
      cursor: pointer; transition: transform 0.15s, filter 0.15s;
    }
    .btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
    .btn:active { transform: scale(0.97); }
    .btn-green { background: linear-gradient(135deg, #10b981, #059669); }
    .key-box {
      margin-top: 15px; padding: 16px; background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 12px;
      display: none; align-items: center; justify-content: space-between; gap: 10px;
    }
    .key-text { font-family: monospace; font-size: 17px; font-weight: 900; color: #38bdf8; letter-spacing: 2px; }
    .recent-list { margin-top: 15px; display: flex; flex-direction: column; gap: 8px; }
    .recent-item {
      padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px; display: flex; align-items: center; justify-content: space-between; font-family: monospace; font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>⚡ PHYSICBOT TRIAL KEY GENERATOR</h1>
      <p>Generate secure, cryptographic trial keys that self-expire after exactly 1 hour (+15m buffer).</p>
      <div style="margin-top: 18px; display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="btn btn-green" id="genBtn" onclick="createKey(75)">+ GENERATE 1-HOUR TRIAL KEY</button>
        <button class="btn" onclick="createKey(135)">+ GENERATE 2-HOUR KEY</button>
      </div>
      <div class="key-box" id="keyBox">
        <div>
          <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Generated Key (Copy & Send to Friend):</div>
          <div class="key-text" id="keyText"></div>
        </div>
        <button class="btn" style="padding: 8px 14px; font-size: 12px;" onclick="copyKey()">COPY KEY</button>
      </div>
    </div>

    <div class="card">
      <h1>SAVED KEYS IN THIS BROWSER</h1>
      <p>Keys you generated recently from this device:</p>
      <div class="recent-list" id="recentList"></div>
    </div>
  </div>

  <script>
    function renderRecent() {
      const keys = JSON.parse(localStorage.getItem('my_generated_keys') || '[]');
      const container = document.getElementById('recentList');
      if (keys.length === 0) {
        container.innerHTML = '<div style=\"color:#64748b;font-size:12px;text-align:center;padding:12px;\">No keys generated yet.</div>';
        return;
      }
      container.innerHTML = keys.map(k => \`
        <div class=\"recent-item\">
          <span style=\"color:#38bdf8;font-weight:bold;\">\${k.key}</span>
          <span style=\"color:#94a3b8;font-size:11px;\">\${k.label}</span>
          <button class=\"btn\" style=\"padding:4px 10px;font-size:11px;\" onclick=\"navigator.clipboard.writeText('\${k.key}');alert('Copied!');\">Copy</button>
        </div>
      \`).join('');
    }

    async function createKey(mins) {
      const btn = document.getElementById('genBtn');
      btn.textContent = 'GENERATING...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/generate?secret=${ADMIN_SECRET}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ durationMinutes: mins })
        });
        const data = await res.json();
        if (data.key) {
          document.getElementById('keyBox').style.display = 'flex';
          document.getElementById('keyText').textContent = data.key;
          
          const list = JSON.parse(localStorage.getItem('my_generated_keys') || '[]');
          list.unshift({ key: data.key, label: mins <= 75 ? '1 Hour' : '2 Hours', created: Date.now() });
          localStorage.setItem('my_generated_keys', JSON.stringify(list.slice(0, 10)));
          renderRecent();
        }
      } catch (err) {
        alert('Failed: ' + err.message);
      } finally {
        btn.textContent = '+ GENERATE 1-HOUR TRIAL KEY';
        btn.disabled = false;
      }
    }

    function copyKey() {
      const k = document.getElementById('keyText').textContent;
      navigator.clipboard.writeText(k).then(() => {
        alert('Copied key to clipboard: ' + k);
      });
    }

    renderRecent();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=UTF-8" }
  });
}
