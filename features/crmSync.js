class CrmSyncFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'crmSync';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.crmSync !== false;
    this.webhookUrl = config.crm?.webhookUrl || null;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!crm export ')) {
      if (!isOwner) {
        await reply('Only admins can export CRM data.');
        return true;
      }
      return this.exportData(text.slice('!crm export '.length).trim(), sender, reply);
    }

    if (lower.startsWith('!crm webhook ')) {
      if (!isOwner) {
        await reply('Only admins can set the webhook URL.');
        return true;
      }
      return this.setWebhook(text.slice('!crm webhook '.length).trim(), reply);
    }

    if (lower === '!crm status') {
      if (!isOwner) {
        await reply('Only admins can check CRM status.');
        return true;
      }
      return this.showStatus(reply);
    }

    if (lower.startsWith('!crm')) {
      await reply('Commands: !crm export [type], !crm webhook [url], !crm status');
      return true;
    }

    return false;
  }

  async exportData(type, sender, reply) {
    const validTypes = ['leads', 'tickets', 'orders', 'feedback'];
    if (!validTypes.includes(type)) {
      await reply(`Unknown type. Valid types: ${validTypes.join(', ')}`);
      return true;
    }

    try {
      let data;
      switch (type) {
        case 'leads':
          data = await this.db.all('SELECT * FROM leads ORDER BY created_at DESC LIMIT 100');
          break;
        case 'tickets':
          data = await this.db.all('SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 100');
          break;
        case 'orders':
          data = await this.db.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
          break;
        case 'feedback':
          data = await this.db.all('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100');
          break;
      }

      if (!data || data.length === 0) {
        await reply(`No ${type} data to export.`);
        return true;
      }

      const result = await this.postToWebhook({ type, data, exportedAt: new Date().toISOString() });
      if (result) {
        await reply(`Exported ${data.length} ${type} records to CRM webhook.`);
      } else {
        await reply(`Data prepared (${data.length} records) but webhook not configured. Use !crm webhook [url] to set one.`);
      }
    } catch (err) {
      await reply(`Failed to export ${type} data.`);
    }
    return true;
  }

  async setWebhook(url, reply) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      await reply('Please provide a valid URL starting with http:// or https://');
      return true;
    }
    try {
      this.webhookUrl = url;
      await this.db.run(
        'INSERT OR REPLACE INTO crm_config (key, value) VALUES ("webhook_url", ?)',
        [url]
      );
      await reply(`CRM webhook set to: ${url}`);
    } catch (err) {
      await reply('Failed to save webhook URL.');
    }
    return true;
  }

  async showStatus(reply) {
    try {
      const config = await this.db.get('SELECT * FROM crm_config WHERE key = "webhook_url"');
      const webhook = config ? config.value : null;

      const counts = await this.db.all(`
        SELECT 'leads' as type, COUNT(*) as count FROM leads
        UNION ALL SELECT 'tickets', COUNT(*) FROM support_tickets
        UNION ALL SELECT 'orders', COUNT(*) FROM orders
        UNION ALL SELECT 'feedback', COUNT(*) FROM feedback
      `);

      let msg = '*CRM Sync Status*\n\n';
      msg += `Webhook: ${webhook || 'Not configured'}\n\n`;
      msg += '*Data Counts:*\n';
      for (const row of counts) {
        msg += `${row.type}: ${row.count}\n`;
      }
      await reply(msg.trim());
    } catch (err) {
      await reply('Failed to get CRM status.');
    }
  }

  async postToWebhook(data) {
    if (!this.webhookUrl) return false;
    try {
      const https = require('https');
      const http = require('http');
      const body = JSON.stringify(data);
      const url = new URL(this.webhookUrl);
      const client = url.protocol === 'https:' ? https : http;
      return new Promise((resolve, reject) => {
        const req = client.request(
          {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          },
          (res) => {
            resolve(res.statusCode >= 200 && res.statusCode < 300);
          }
        );
        req.on('error', () => resolve(false));
        req.write(body);
        req.end();
      });
    } catch {
      return false;
    }
  }
}

module.exports = CrmSyncFeature;
