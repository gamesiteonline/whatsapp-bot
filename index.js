const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const http = require('http');
const path = require('path');
const pino = require('pino');
const config = require('./config');

const PORT = process.env.PORT || 8080;
const OWNER_NUMBER = config.ownerNumber;
const BOT_NAME = config.botName;
const PREFIX = config.prefix;

const { initDatabase, getDb } = require('./database/db');
const { runMigrations } = require('./database/migrations');

let db;

const AIRouter = require('./services/aiRouter');
const aiRouter = new AIRouter(config);

const ContextMemory = require('./core/contextMemory');
const IntentEngine = require('./core/intentEngine');
const SentimentAnalyzer = require('./core/sentimentAnalyzer');
const DynamicResponder = require('./core/dynamicResponder');
const CommandHandler = require('./core/commandHandler');

const contextMemory = new ContextMemory();
const sentimentAnalyzer = new SentimentAnalyzer();
const intentEngine = new IntentEngine(aiRouter);
const dynamicResponder = new DynamicResponder(aiRouter, contextMemory);

const FEATURE_ORDER = [
  'rateLimiter', 'antiPhishing', 'parentalControls',
  'faq', 'orders', 'appointments', 'leads', 'payments',
  'alerts', 'menus', 'supportRouting', 'feedback', 'multimedia',
  'cartReminders', 'translation', 'otpVerification', 'crmSync', 'contentDelivery',
  'aiSearch', 'locations', 'games', 'groupModeration', 'tickets',
  'invoices', 'inventory', 'coupons', 'subscriptions', 'analytics',
  'memeGenerator', 'musicDiscovery', 'storyteller', 'virtualPet',
  'socialPoster', 'calendarSync', 'weatherAlerts', 'cryptoStocks',
  'emailGateway', 'jiraIntegration', 'webhookForwarder', 'autoDelete',
  'encryptedNotes', 'voiceTranscription', 'imageUnderstanding', 'imageGeneration'
];

let features = {};
let commandHandler = null;
let sock = null;

const botState = {
  status: 'initializing',
  pairingCode: null,
  phoneNumber: null,
  lastPairingAt: null,
  connectedAt: null,
  startTime: Date.now(),
  logs: []
};

function botLog(msg) {
  const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(msg);
  botState.logs.unshift(entry);
  if (botState.logs.length > 100) botState.logs.length = 100;
}

function initFeatures() {
  features = {};
  for (const name of FEATURE_ORDER) {
    if (config.features[name] === false) continue;
    try {
      const Klass = require(`./features/${name}`);
      const instance = new Klass(sock, config, db, aiRouter, contextMemory, {
        formatTime: () => new Date().toLocaleTimeString(),
        randomId: () => Math.random().toString(36).substring(2, 8)
      });
      features[name] = instance;
      if (typeof instance.initialize === 'function') instance.initialize();
      botLog(`Feature loaded: ${name}`);
    } catch (e) {
      console.warn(`  ? ${name}: ${e.message}`);
    }
  }
  commandHandler = new CommandHandler(sock, aiRouter);
}

async function connectToWhatsApp() {
  if (!db) {
    botLog('Initializing database...');
    db = await initDatabase();
    runMigrations();
    botLog('Database ready');
  }

  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();
  botLog(`Baileys v${version.join('.')}`);

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'error' }))
    },
    printQRInTerminal: false,
    logger: pino({ level: 'error' }),
    browser: ['Faliz-DG', 'Chrome', '1.0.0']
  });

  initFeatures();

  if (!state.creds.registered && OWNER_NUMBER) {
    setTimeout(async () => {
      try {
        const num = OWNER_NUMBER.replace(/[^0-9]/g, '');
        const code = await sock.requestPairingCode(num);
        botState.pairingCode = code;
        botState.phoneNumber = num;
        botState.lastPairingAt = Date.now();
        botState.status = 'paired';
        botLog(`Pairing Code: ${code}`);
        botLog(`Open WhatsApp > Linked Devices > Link a Device`);
      } catch (e) {
        botLog(`Pairing code error: ${e.message}`);
      }
    }, 3000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'connecting') {
      botState.status = 'connecting';
      botLog('Connecting...');
    }
    if (connection === 'open') {
      botState.status = 'connected';
      botState.connectedAt = Date.now();
      botLog('Connected!');
    }
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      botState.status = 'disconnected';
      botLog(`Disconnected: ${DisconnectReason[reason] || reason}`);
      if (reason !== DisconnectReason.loggedOut) {
        botLog('Reconnecting in 5s...');
        setTimeout(connectToWhatsApp, 5000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages: msgs }) => {
    for (const msg of msgs) {
      try { await processMessage(msg); }
      catch (e) { console.error('Msg error:', e.message); }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    if (update.action === 'add' && features.groupModeration) {
      await features.groupModeration.handle({ key: { remoteJid: update.id } }, '', update.participants[0], true, false, (t) =>
        sock.sendMessage(update.id, { text: t, mentions: update.participants })
      );
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

async function processMessage(msg) {
  if (msg.key?.remoteJid === 'status@broadcast') return;
  if (msg.key?.fromMe) return;

  const sender = msg.key?.participant || msg.key?.remoteJid;
  if (!sender) return;
  const isGroup = msg.key.remoteJid.endsWith('@g.us');
  const isOwner = OWNER_NUMBER && sender.replace(/[^0-9]/g, '').includes(OWNER_NUMBER.replace(/[^0-9]/g, ''));

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    '';

  const hasAudio = !!msg.message?.audioMessage;
  const hasImage = !!msg.message?.imageMessage;
  if (!text && !hasAudio && !hasImage) return;

  const remoteJid = msg.key.remoteJid;
  const reply = (content) => sock.sendMessage(remoteJid, { text: content });

  if (text) contextMemory.add(sender, 'user', text);

  if (features.rateLimiter) {
    const blocked = await features.rateLimiter.handle(msg, text, sender, isGroup, isOwner, reply);
    if (blocked) return;
  }

  if (text && features.antiPhishing) {
    const phish = await features.antiPhishing.handle(msg, text, sender, isGroup, isOwner, reply);
    if (phish) return;
  }

  if (text && features.parentalControls) {
    const parent = await features.parentalControls.handle(msg, text, sender, isGroup, isOwner, reply);
    if (parent) return;
  }

  const isCommand = text.startsWith(PREFIX);

  if (isCommand) {
    let handled = false;
    for (const name of FEATURE_ORDER) {
      if (!features[name]) continue;
      try {
        if (await features[name].handle(msg, text, sender, isGroup, isOwner, reply)) {
          handled = true;
          break;
        }
      } catch (e) {
        console.error(`${name}:`, e.message);
      }
    }
    if (!handled && commandHandler) {
      await commandHandler.handleMessage(msg, text, sender, isGroup, isOwner, reply);
    }
    return;
  }

  for (const name of ['autoDelete', 'encryptedNotes', 'voiceTranscription', 'imageUnderstanding', 'imageGeneration']) {
    if (!features[name]) continue;
    try {
      const handled = await features[name].handle(msg, text, sender, isGroup, isOwner, reply);
      if (handled) return;
    } catch (e) {
      console.error(`${name}:`, e.message);
    }
  }

  if (features.webhookForwarder) {
    await features.webhookForwarder.handle(msg, text, sender, isGroup, isOwner, reply);
  }

  if (text && !isGroup) {
    const l = text.toLowerCase();
    let emoji = null;
    if (/^(hi|hello|hey|yo|hai)\b/.test(l)) emoji = '👋';
    else if (/\b(thanks|thank|thx|ty)\b/.test(l)) emoji = '👍';
    else if (/\b(bye|goodbye|cya)\b/.test(l)) emoji = '👋';
    else if (/\b(lol|lmao|haha|funny)\b/.test(l)) emoji = '😂';
    if (emoji) {
      try { await sock.sendMessage(remoteJid, { react: { text: emoji, key: msg.key } }); }
      catch (_) {}
    }

    const intent = intentEngine.classify(text);
    const response = await dynamicResponder.generate(sender, text, intent.intent);
    if (response) await reply(response);
  }
}

function serveJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function serveHtml(res, html, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/api/status') {
    return serveJson(res, {
      status: botState.status,
      pairingCode: botState.pairingCode,
      phoneNumber: botState.phoneNumber,
      lastPairingAt: botState.lastPairingAt,
      connectedAt: botState.connectedAt,
      uptime: Math.floor((Date.now() - botState.startTime) / 1000),
      botName: BOT_NAME,
      prefix: PREFIX,
      featureCount: Object.keys(features).length,
      ownerNumber: OWNER_NUMBER ? OWNER_NUMBER.replace(/[^0-9]/g, '').replace(/^(.{3})(.{4})(.{4})$/, '$1****$3') : null
    });
  }

  if (url === '/api/logs') {
    return serveJson(res, { logs: botState.logs.slice(0, 50) });
  }

  if (req.method === 'POST' && url === '/api/pair') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { phone } = JSON.parse(body);
        const clean = phone.replace(/[^0-9]/g, '');
        if (clean.length < 7) return serveJson(res, { success: false, error: 'Invalid phone number' }, 400);
        process.env.OWNER_NUMBER = clean;
        botState.phoneNumber = clean;
        botState.status = 'connecting';
        botState.pairingCode = null;
        botLog(`Requesting code for ${clean}`);
        if (sock && botState.status !== 'disconnected') {
          const code = await sock.requestPairingCode(clean);
          botState.pairingCode = code;
          botState.lastPairingAt = Date.now();
          botState.status = 'paired';
          botLog(`Pairing Code: ${code}`);
          serveJson(res, { success: true, code });
        } else {
          serveJson(res, { success: false, error: 'Bot disconnected, reconnect first' });
        }
      } catch (e) {
        serveJson(res, { success: false, error: e.message }, 500);
      }
    });
    return;
  }

  if (url === '/health') {
    return serveJson(res, { status: 'ok', bot: BOT_NAME, uptime: process.uptime() });
  }

  if (url === '/' || url === '/dashboard') {
    const statusColor = {
      initializing: '#888',
      connecting: '#ffa500',
      paired: '#ffd700',
      connected: '#00ff88',
      disconnected: '#ff4444'
    }[botState.status] || '#888';

    const statusLabel = {
      initializing: 'Starting...',
      connecting: 'Connecting',
      paired: 'Paired - Scan Code',
      connected: 'Connected',
      disconnected: 'Disconnected'
    }[botState.status] || 'Unknown';

    const connectedSince = botState.connectedAt
      ? Math.floor((Date.now() - botState.connectedAt) / 1000)
      : null;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${BOT_NAME} Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#e0e0e0;font-family:'Courier New',monospace;min-height:100vh;display:flex;justify-content:center;padding:20px}
.container{max-width:560px;width:100%}
h1{font-size:22px;margin-bottom:4px;color:#fff}
.sub{color:#888;font-size:13px;margin-bottom:24px}
.card{background:#14141f;border:1px solid #2a2a3a;border-radius:12px;padding:24px;margin-bottom:16px}
.status-row{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.status-dot{width:12px;height:12px;border-radius:50%;background:${statusColor};box-shadow:0 0 8px ${statusColor}}
.status-label{font-size:16px;color:#fff;font-weight:bold}
.status-sub{font-size:12px;color:#888;margin-top:2px}
.pairing-box{text-align:center;padding:24px 16px}
.pairing-code{font-size:36px;font-weight:bold;letter-spacing:8px;color:#ffd700;font-family:'Courier New',monospace;text-shadow:0 0 20px rgba(255,215,0,0.3);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}
.pairing-label{font-size:12px;color:#888;margin-bottom:16px;text-transform:uppercase;letter-spacing:2px}
.pairing-hint{font-size:12px;color:#666;margin-top:12px;line-height:1.5}
.phone-form{display:flex;gap:8px;margin-top:16px}
.phone-form input{flex:1;background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;font-family:inherit;outline:none}
.phone-form input:focus{border-color:#ffd700}
.phone-form button{background:#ffd700;color:#000;border:none;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:bold;cursor:pointer;font-family:inherit}
.phone-form button:hover{background:#ffe44d}
.phone-form button:disabled{opacity:0.5;cursor:not-allowed}
.stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px}
.stat{text-align:center;padding:12px;background:#0a0a0f;border-radius:8px}
.stat-value{font-size:20px;font-weight:bold;color:#fff}
.stat-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:4px}
.logs-box{background:#0a0a0f;border-radius:8px;padding:12px;height:200px;overflow-y:auto;font-size:11px;line-height:1.8;color:#888}
.logs-box::-webkit-scrollbar{width:4px}
.logs-box::-webkit-scrollbar-track{background:transparent}
.logs-box::-webkit-scrollbar-thumb{background:#2a2a3a;border-radius:2px}
.btn-reconnect{width:100%;padding:10px;background:#2a2a3a;color:#e0e0e0;border:1px solid #3a3a4a;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;margin-top:8px}
.btn-reconnect:hover{background:#3a3a4a}
.footer{text-align:center;font-size:10px;color:#444;padding:16px 0}
</style>
</head>
<body>
<div class="container">
<h1>🤖 ${BOT_NAME}</h1>
<div class="sub">WhatsApp Bot Dashboard</div>

<div class="card">
  <div class="status-row">
    <div class="status-dot"></div>
    <div class="status-label">${statusLabel}</div>
  </div>
  <div class="status-sub">
    ${connectedSince ? `Connected for ${Math.floor(connectedSince/60)}m ${connectedSince%60}s` : 'Uptime: ' + Math.floor((Date.now() - botState.startTime)/1000) + 's'}
  </div>
</div>

<div class="card" id="pairingCard">
  <div class="pairing-box">
    ${botState.pairingCode ? `
      <div class="pairing-label">Pairing Code</div>
      <div class="pairing-code">${botState.pairingCode}</div>
      <div class="pairing-hint">Open WhatsApp → Linked Devices → Link a Device<br>Enter this 8-digit code when prompted</div>
    ` : `
      <div class="pairing-label" style="color:#666">No Pairing Code Yet</div>
      <div class="pairing-hint">${botState.status === 'connected' ? 'Already connected!' : 'Enter your phone number below to request a pairing code'}</div>
    `}
  </div>
  <div class="phone-form">
    <input type="text" id="phoneInput" placeholder="e.g. 255796339436" value="${botState.phoneNumber || ''}">
    <button id="pairBtn" onclick="requestPair()">Request Code</button>
  </div>
</div>

<div class="stats">
  <div class="stat">
    <div class="stat-value" id="featureCount">${Object.keys(features).length}</div>
    <div class="stat-label">Features</div>
  </div>
  <div class="stat">
    <div class="stat-value">${PREFIX}</div>
    <div class="stat-label">Prefix</div>
  </div>
  <div class="stat">
    <div class="stat-value" id="uptimeDisplay">${Math.floor((Date.now() - botState.startTime)/1000)}s</div>
    <div class="stat-label">Uptime</div>
  </div>
</div>

<div class="card">
  <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Logs</div>
  <div class="logs-box" id="logsBox"></div>
  <button class="btn-reconnect" onclick="reconnect()">🔄 Reconnect Bot</button>
</div>

<div class="footer">Faliz-DG - Multi-Provider AI WhatsApp Bot</div>
</div>

<script>
function requestPair() {
  const btn = document.getElementById('pairBtn');
  const phone = document.getElementById('phoneInput').value.trim();
  if (!phone) return;
  btn.disabled = true;
  btn.textContent = 'Requesting...';
  fetch('/api/pair', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({phone}) })
    .then(r=>r.json()).then(d=>{
      if(d.success) {
        document.getElementById('pairingCard').innerHTML = \`
          <div class="pairing-box">
            <div class="pairing-label">Pairing Code</div>
            <div class="pairing-code">\${d.code}</div>
            <div class="pairing-hint">Open WhatsApp → Linked Devices → Link a Device</div>
          </div>
          <div class="phone-form">
            <input type="text" id="phoneInput" value="\${phone}">
            <button id="pairBtn" onclick="requestPair()">Request Code</button>
          </div>\`;
      } else {
        alert('Error: ' + (d.error || 'Unknown'));
        btn.disabled = false;
        btn.textContent = 'Request Code';
      }
    }).catch(e=>{ alert('Error: '+e.message); btn.disabled=false; btn.textContent='Request Code'; });
}
function reconnect() {
  if(confirm('Reconnect bot?')) fetch('/api/pair', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:document.getElementById('phoneInput').value})});
}
async function poll() {
  try {
    const s = await fetch('/api/status').then(r=>r.json());
    const dot = document.querySelector('.status-dot');
    const label = document.querySelector('.status-label');
    const sub = document.querySelector('.status-sub');
    const statusMap = { initializing:'Starting...', connecting:'Connecting', paired:'Paired', connected:'Connected', disconnected:'Disconnected' };
    const colorMap = { initializing:'#888', connecting:'#ffa500', paired:'#ffd700', connected:'#00ff88', disconnected:'#ff4444' };
    if(dot) dot.style.background = colorMap[s.status]||'#888';
    if(dot) dot.style.boxShadow = '0 0 8px '+(colorMap[s.status]||'#888');
    if(label) label.textContent = statusMap[s.status]||'Unknown';
    if(sub) sub.textContent = s.connectedAt ? 'Connected for '+Math.floor((Date.now()-s.connectedAt)/60000)+'m' : 'Uptime: '+s.uptime+'s';
    document.getElementById('featureCount').textContent = s.featureCount;
    document.getElementById('uptimeDisplay').textContent = s.uptime+'s';
  } catch(e) {}
  try {
    const l = await fetch('/api/logs').then(r=>r.json());
    const box = document.getElementById('logsBox');
    if(box) box.innerHTML = l.logs.map(x=>'<div>'+x+'</div>').join('');
  } catch(e) {}
}
setInterval(poll, 2000);
poll();
</script>
</body>
</html>`;
    return serveHtml(res, html);
  }

  res.writeHead(404).end();
}).listen(PORT, () => botLog(`Web dashboard: http://0.0.0.0:${PORT}`));

botLog(`${BOT_NAME}`);
botLog(`Owner: ${OWNER_NUMBER || 'not set'}`);
botLog(`Prefix: "${PREFIX}"`);
botLog(`Features: ${FEATURE_ORDER.length}`);
connectToWhatsApp();
