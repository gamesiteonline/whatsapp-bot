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

const db = require('./database/db');
const { runMigrations } = require('./database/migrations');
runMigrations();

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
      console.log(`  ${name}`);
    } catch (e) {
      console.warn(`  ? ${name}: ${e.message}`);
    }
  }
  commandHandler = new CommandHandler(sock, aiRouter);
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();
  console.log(`Baileys v${version.join('.')}`);

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
        console.log(`\nPairing Code: ${code}`);
        console.log(`Open WhatsApp > Linked Devices > Link a Device\n`);
      } catch (e) {
        console.error('Pairing code error:', e.message);
      }
    }, 3000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'connecting') console.log('Connecting...');
    if (connection === 'open') console.log('Connected!');
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`Disconnected: ${DisconnectReason[reason] || reason}`);
      if (reason !== DisconnectReason.loggedOut) {
        console.log('Reconnecting in 5s...');
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

http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bot: BOT_NAME, uptime: process.uptime(), features: Object.keys(features) }));
  } else {
    res.writeHead(404).end();
  }
}).listen(PORT, () => console.log(`Server on port ${PORT}`));

console.log(`\n${BOT_NAME}`);
console.log(`Owner: ${OWNER_NUMBER || 'not set'}`);
console.log(`Prefix: "${PREFIX}"`);
console.log(`Features: ${FEATURE_ORDER.length}`);
connectToWhatsApp();
