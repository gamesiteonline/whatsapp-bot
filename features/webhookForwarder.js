const axios = require('axios');

class WebhookForwarder {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'webhookForwarder';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
  }

  get enabled() {
    return this.config.features?.webhookForwarder !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!webhook')) {
      const parts = text.split(' ');
      const sub = (parts[1] || '').toLowerCase();

      if (sub === 'set' && parts[2]) {
        const url = parts.slice(2).join(' ');
        await this.db.set(`webhook:${sender}`, url);
        await reply(`✅ Webhook URL set to:\n${url}`);
        return true;
      }

      if (sub === 'remove') {
        await this.db.delete(`webhook:${sender}`);
        await reply('✅ Webhook removed.');
        return true;
      }

      if (sub === 'status') {
        const url = await this.db.get(`webhook:${sender}`);
        if (url) {
          await reply(`📡 Webhook configured:\n${url}`);
        } else {
          await reply('❌ No webhook configured.\nUse !webhook set <url>');
        }
        return true;
      }

      await reply('Usage:\n!webhook set <url>\n!webhook remove\n!webhook status');
      return true;
    }

    if (sender && !text.startsWith('!') && !isOwner) {
      const whUrl = await this.db.get(`webhook:${sender}`);
      if (whUrl) {
        try {
          await axios.post(whUrl, {
            sender, text, isGroup,
            timestamp: new Date().toISOString()
          }, { timeout: 5000 });
        } catch (_) {}
      }
    }

    return false;
  }
}

module.exports = WebhookForwarder;
