class AutoDelete {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'autoDelete';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.timers = new Map();
  }

  get enabled() {
    return this.config.features?.autoDelete !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!autodelete')) {
      const arg = text.split(' ')[1];

      if (!arg) {
        const current = await this.db.get(`autodelete:${sender}`);
        if (current) {
          await reply(`⏱️ Auto-delete is set to ${current} seconds.`);
        } else {
          await reply('❌ Auto-delete is off.\nUsage: !autodelete <seconds> or !autodelete off');
        }
        return true;
      }

      if (arg.toLowerCase() === 'off') {
        await this.db.delete(`autodelete:${sender}`);
        await reply('✅ Auto-delete turned off.');
        return true;
      }

      const seconds = parseInt(arg, 10);
      if (isNaN(seconds) || seconds < 5 || seconds > 86400) {
        await reply('❌ Please provide a valid time in seconds (5–86400).');
        return true;
      }

      await this.db.set(`autodelete:${sender}`, seconds);
      await reply(`✅ Auto-delete set to ${seconds} seconds. Messages will auto-delete after ${seconds}s.`);
      return true;
    }

    if (msg.key && sender) {
      const seconds = await this.db.get(`autodelete:${sender}`);
      if (seconds && !isNaN(seconds)) {
        this._scheduleDeletion(msg.key, seconds * 1000);
      }
    }

    return false;
  }

  _scheduleDeletion(key, delay) {
    const keyStr = JSON.stringify(key);
    if (this.timers.has(keyStr)) {
      clearTimeout(this.timers.get(keyStr));
    }
    const timer = setTimeout(async () => {
      try {
        await this.sock.sendMessage(key.remoteJid, { delete: key });
      } catch (_) {}
      this.timers.delete(keyStr);
    }, delay);
    this.timers.set(keyStr, timer);
  }
}

module.exports = AutoDelete;
