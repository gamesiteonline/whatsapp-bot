class AlertsFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'alerts';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.alerts !== false;
    this.cron = null;
    try { this.cron = require('node-cron'); } catch {}
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!broadcast ')) {
      if (!isOwner) {
        await reply('Only the bot owner can broadcast messages.');
        return true;
      }
      const message = text.slice('!broadcast '.length).trim();
      if (!message) {
        await reply('Usage: !broadcast [message]');
        return true;
      }
      await this.broadcastMessage(message, sender, reply);
      return true;
    }

    if (lower.startsWith('!alert ')) {
      if (!isOwner) {
        await reply('Only the bot owner can send alerts.');
        return true;
      }
      const content = text.slice('!alert '.length).trim();
      const spaceIdx = content.indexOf(' ');
      if (spaceIdx === -1) {
        await reply('Usage: !alert [jid] [message]');
        return true;
      }
      const jid = content.slice(0, spaceIdx).trim();
      const message = content.slice(spaceIdx + 1).trim();
      await this.sendDirectAlert(jid, message, sender, reply);
      return true;
    }

    if (lower.startsWith('!remind ')) {
      if (!isOwner) {
        await reply('Only the bot owner can set reminders.');
        return true;
      }
      const content = text.slice('!remind '.length).trim();
      const parts = content.split(/\s+/);
      if (parts.length < 3) {
        await reply('Usage: !remind [jid] [time] [message]\nTime format: * * * * * (cron) or 5m, 1h, 1d');
        return true;
      }
      const jid = parts[0];
      const timeSpec = parts[1];
      const message = parts.slice(2).join(' ');
      await this.scheduleReminder(jid, timeSpec, message, sender, reply);
      return true;
    }

    return false;
  }

  async broadcastMessage(message, adminJid, reply) {
    try {
      const users = await this.db.all('SELECT DISTINCT jid FROM users WHERE jid IS NOT NULL');
      if (!users || users.length === 0) {
        await reply('No users to broadcast to.');
        return true;
      }
      let sent = 0;
      let failed = 0;
      for (const user of users) {
        try {
          await this.sock.sendMessage(user.jid, { text: `*Broadcast:*\n\n${message}` });
          sent++;
        } catch {
          failed++;
        }
      }
      await reply(`Broadcast sent to ${sent} users. Failed: ${failed}`);
    } catch (err) {
      await reply('Failed to broadcast message.');
    }
  }

  async sendDirectAlert(jid, message, adminJid, reply) {
    try {
      await this.sock.sendMessage(jid, { text: `*Alert:*\n\n${message}` });
      await reply(`Alert sent to ${jid}.`);
    } catch (err) {
      await reply(`Failed to send alert to ${jid}.`);
    }
  }

  async scheduleReminder(jid, timeSpec, message, adminJid, reply) {
    let cronExpr;

    const durationMatch = timeSpec.match(/^(\d+)([mhd])$/);
    if (durationMatch) {
      const value = parseInt(durationMatch[1]);
      const unit = durationMatch[2];
      let minutes;
      if (unit === 'm') minutes = value;
      else if (unit === 'h') minutes = value * 60;
      else if (unit === 'd') minutes = value * 60 * 24;
      const now = new Date();
      const future = new Date(now.getTime() + minutes * 60000);
      cronExpr = `${future.getMinutes()} ${future.getHours()} ${future.getDate()} ${future.getMonth() + 1} *`;
    } else {
      const parts = timeSpec.split(/\s+/);
      if (parts.length === 5) {
        cronExpr = timeSpec;
      } else {
        await reply('Invalid time format. Use cron expression (5 fields) or relative (e.g., 5m, 1h, 1d).');
        return true;
      }
    }

    try {
      const reminderId = `REM-${Date.now().toString(36).toUpperCase()}`;
      await this.db.run(
        'INSERT INTO cron_schedules (id, jid, cron_expr, action, payload, created_at, active) VALUES (?, ?, ?, ?, ?, datetime("now"), 1)',
        [reminderId, jid, cronExpr, 'reminder', JSON.stringify({ message })]
      );

      if (this.cron && this.cron.validate(cronExpr)) {
        this.cron.schedule(cronExpr, async () => {
          try {
            await this.sock.sendMessage(jid, { text: `*Reminder:*\n\n${message}` });
            await this.db.run('UPDATE cron_schedules SET active = 0 WHERE id = ?', [reminderId]);
          } catch {}
        });
      }

      await reply(`Reminder scheduled (ID: ${reminderId}).`);
    } catch (err) {
      await reply('Failed to schedule reminder.');
    }
  }
}

module.exports = AlertsFeature;
