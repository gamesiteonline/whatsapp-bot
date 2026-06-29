class ParentalControls {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'parentalControls';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
  }

  get enabled() {
    return this.config.features?.parentalControls !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!parent')) {
      if (!isOwner) {
        await reply('❌ Only the bot owner can use parental controls.');
        return true;
      }

      const parts = text.split(' ');
      const sub = (parts[1] || '').toLowerCase();

      if (sub === 'monitor' && parts[2]) {
        const target = this._extractUser(parts[2]);
        if (!target) {
          await reply('❌ Invalid user. Use @mention.');
          return true;
        }
        const monitored = await this.db.get('parent:monitored') || {};
        monitored[target] = true;
        await this.db.set('parent:monitored', monitored);
        await reply(`✅ Now monitoring @${target.split('@')[0]}.`);
        return true;
      }

      if (sub === 'block' && parts.length > 2) {
        const keyword = parts.slice(2).join(' ').toLowerCase();
        const blocked = await this.db.get('parent:blockedKeywords') || [];
        if (!blocked.includes(keyword)) {
          blocked.push(keyword);
          await this.db.set('parent:blockedKeywords', blocked);
        }
        await reply(`✅ Blocked keyword: "${keyword}"`);
        return true;
      }

      if (sub === 'unblock' && parts.length > 2) {
        const keyword = parts.slice(2).join(' ').toLowerCase();
        const blocked = await this.db.get('parent:blockedKeywords') || [];
        const idx = blocked.indexOf(keyword);
        if (idx !== -1) {
          blocked.splice(idx, 1);
          await this.db.set('parent:blockedKeywords', blocked);
          await reply(`✅ Unblocked keyword: "${keyword}"`);
        } else {
          await reply(`❌ Keyword "${keyword}" not found in block list.`);
        }
        return true;
      }

      if (sub === 'alerts') {
        const current = await this.db.get('parent:alerts') || false;
        await this.db.set('parent:alerts', !current);
        await reply(`✅ Parent alerts ${!current ? 'enabled' : 'disabled'}.`);
        return true;
      }

      await reply('Parental Controls:\n!parent monitor @user\n!parent block <keyword>\n!parent unblock <keyword>\n!parent alerts');
      return true;
    }

    const monitored = await this.db.get('parent:monitored') || {};
    const alertsEnabled = await this.db.get('parent:alerts') || false;

    if (monitored[sender]) {
      const blockedKeywords = await this.db.get('parent:blockedKeywords') || [];
      for (const keyword of blockedKeywords) {
        if (lower.includes(keyword)) {
          const owner = this.config.ownerNumber;
          if (owner && alertsEnabled) {
            await this.sock.sendMessage(owner, {
              text: `⚠️ *Parental Alert*\n\nMonitored user @${sender.split('@')[0]} sent blocked content.\n*Blocked Word:* "${keyword}"\n*Message:* ${text.substring(0, 200)}`,
              mentions: [sender]
            });
          }
          return true;
        }
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

module.exports = ParentalControls;
