class RateLimiter {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'rateLimiter';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;

    this.messageCounts = new Map();
    this.limits = new Map();
    this.blocked = new Map();
  }

  get enabled() {
    return this.config.features?.rateLimiter !== false;
  }

  async initialize() {
    const stored = await this.db.get('ratelimiter:limits') || {};
    for (const [user, limit] of Object.entries(stored)) {
      this.limits.set(user, limit);
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!limit')) {
      if (!isOwner) {
        await reply('❌ Only the bot owner can manage rate limits.');
        return true;
      }

      const parts = text.split(' ');
      const sub = (parts[1] || '').toLowerCase();

      if (sub === 'set' && parts[2] && parts[3]) {
        const target = this._extractUser(parts[2]);
        const maxPerMin = parseInt(parts[3], 10);
        if (!target) {
          await reply('❌ Invalid user. Use @mention.');
          return true;
        }
        if (isNaN(maxPerMin) || maxPerMin < 1) {
          await reply('❌ Max messages per minute must be at least 1.');
          return true;
        }
        this.limits.set(target, maxPerMin);
        await this.db.set('ratelimiter:limits', Object.fromEntries(this.limits));
        await reply(`✅ Rate limit set for @${target.split('@')[0]}: ${maxPerMin} msg/min.`);
        return true;
      }

      if (sub === 'remove' && parts[2]) {
        const target = this._extractUser(parts[2]);
        if (!target) {
          await reply('❌ Invalid user.');
          return true;
        }
        this.limits.delete(target);
        this.messageCounts.delete(target);
        this.blocked.delete(target);
        await this.db.set('ratelimiter:limits', Object.fromEntries(this.limits));
        await reply(`✅ Rate limit removed for @${target.split('@')[0]}.`);
        return true;
      }

      if (sub === 'status') {
        const entries = Array.from(this.limits.entries());
        if (entries.length === 0) {
          await reply('No rate limits configured.');
        } else {
          let msgText = '📊 *Rate Limits*\n\n';
          for (const [user, limit] of entries) {
            const count = this.messageCounts.get(user)?.count || 0;
            const status = this.blocked.has(user) ? '🔴 Blocked' : '🟢 Active';
            msgText += `@${user.split('@')[0]}: ${limit}/min (current: ${count}) ${status}\n`;
          }
          await this.sock.sendMessage(msg.key.remoteJid, {
            text: msgText,
            mentions: entries.map(e => e[0])
          });
        }
        return true;
      }

      await reply('Usage:\n!limit set @user <maxPerMinute>\n!limit remove @user\n!limit status');
      return true;
    }

    if (!isOwner) {
      const limit = this.limits.get(sender);
      if (limit) {
        const now = Date.now();
        const windowStart = Math.floor(now / 60000);
        const userData = this.messageCounts.get(sender) || { window: windowStart, count: 0 };

        if (userData.window !== windowStart) {
          userData.window = windowStart;
          userData.count = 0;
          this.blocked.delete(sender);
        }

        if (userData.count >= limit) {
          if (!this.blocked.has(sender)) {
            this.blocked.set(sender, now);
            await reply(`⏳ Rate limit exceeded. Max ${limit} msg/min. Please wait.`);
          } else {
            const elapsed = now - this.blocked.get(sender);
            if (elapsed > 60000) {
              this.blocked.delete(sender);
              userData.count = 1;
              this.messageCounts.set(sender, userData);
              return false;
            }
          }
          return true;
        }

        userData.count++;
        this.messageCounts.set(sender, userData);
      }
    }

    return false;
  }

  _extractUser(str) {
    const match = str.match(/@(\d+)/);
    if (match) return match[1] + '@s.whatsapp.net';
    return null;
  }
}

module.exports = RateLimiter;
