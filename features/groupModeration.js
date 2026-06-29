class GroupModeration {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'groupModeration';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.groupModeration !== false;
    this.bannedWords = config.bannedWords || ['spam', 'scam', 'nsfw', 'inappropriate'];
    this.warnCounts = new Map();
    this.messageTimestamps = new Map();
    this.spamLimit = config.spamLimit || 5;
    this.spamWindow = config.spamWindow || 10000;

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS group_rules (group_id TEXT PRIMARY KEY, rules TEXT, updated_at TEXT)').run();
        this.db.prepare('CREATE TABLE IF NOT EXISTS warns (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT, user TEXT, reason TEXT, warned_by TEXT, created_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    if (msg?.message?.participantsUpdateMessage) {
      return this._handleParticipantUpdate(msg, reply);
    }

    if (!isGroup) return false;

    const lower = text.toLowerCase().trim();
    const groupId = msg.key.remoteJid;

    if (lower.startsWith('!warn')) {
      return this._warnUser(msg, text, sender, groupId, reply);
    }

    if (lower.startsWith('!kick')) {
      return this._kickUser(msg, text, sender, groupId, reply);
    }

    if (lower.startsWith('!mute')) {
      return this._muteGroup(msg, sender, groupId, reply);
    }

    if (lower.startsWith('!rules')) {
      return this._setRules(text, sender, groupId, reply);
    }

    if (this._checkBannedWords(text)) {
      await this._warnUser(msg, `!warn @${sender.split('@')[0]} Banned word used`, sender, groupId, reply);
      return true;
    }

    if (this._checkSpam(sender)) {
      await this._warnUser(msg, `!warn @${sender.split('@')[0]} Spamming`, sender, groupId, reply);
      return true;
    }

    return false;
  }

  async _handleParticipantUpdate(msg, reply) {
    try {
      const update = msg.message.participantsUpdateMessage;
      const groupId = msg.key.remoteJid;

      if (update.action === 'add') {
        const rules = this.db
          ? this.db.prepare('SELECT rules FROM group_rules WHERE group_id = ?').get(groupId)
          : null;

        const welcomeText = `Welcome to the group, @${update.participants[0].split('@')[0]}! 🎉\n\nPlease read the rules:\n${rules?.rules || 'Be respectful and follow the guidelines.'}`;

        await this.sock.sendMessage(groupId, {
          text: welcomeText,
          mentions: update.participants,
        });
      }
    } catch {}
  }

  async _warnUser(msg, text, sender, groupId, reply) {
    const isAdmin = await this._isAdmin(sender, groupId);
    if (!isAdmin) return reply('Only group admins can warn users.');

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    const target = mentioned?.[0] || text.split(' ')[1]?.replace('@', '') + '@s.whatsapp.net';

    if (!target) return reply('Usage: !warn @user [reason]');

    const reason = text.split(' ').slice(2).join(' ') || 'No reason provided';

    if (this.db) {
      this.db.prepare('INSERT INTO warns (group_id, user, reason, warned_by, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(groupId, target, reason, sender, new Date().toISOString());
    }

    let count = this.warnCounts.get(target) || 0;
    count++;
    this.warnCounts.set(target, count);

    if (count >= 3) {
      try {
        await this.sock.groupParticipantsUpdate(groupId, [target], 'remove');
        this.warnCounts.delete(target);
        return reply(`@${target.split('@')[0]} has been kicked after 3 warnings.`);
      } catch (err) {
        return reply(`Failed to kick user: ${err.message}`);
      }
    }

    return reply(`⚠️ Warned @${target.split('@')[0]} (${count}/3)\nReason: ${reason}`);
  }

  async _kickUser(msg, text, sender, groupId, reply) {
    const isAdmin = await this._isAdmin(sender, groupId);
    if (!isAdmin) return reply('Only group admins can kick users.');

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    const target = mentioned?.[0];

    if (!target) return reply('Usage: !kick @user');

    try {
      await this.sock.groupParticipantsUpdate(groupId, [target], 'remove');
      return reply(`Kicked @${target.split('@')[0]}.`);
    } catch (err) {
      return reply(`Failed to kick: ${err.message}`);
    }
  }

  async _muteGroup(msg, sender, groupId, reply) {
    const isAdmin = await this._isAdmin(sender, groupId);
    if (!isAdmin) return reply('Only group admins can mute the group.');

    try {
      await this.sock.groupSettingUpdate(groupId, 'announcement');
      return reply('Group has been muted (only admins can send messages).');
    } catch (err) {
      return reply(`Failed to mute: ${err.message}`);
    }
  }

  async _setRules(text, sender, groupId, reply) {
    const isAdmin = await this._isAdmin(sender, groupId);
    if (!isAdmin) return reply('Only group admins can set rules.');

    const rulesText = text.slice(7).trim();
    if (!rulesText) return reply('Usage: !rules [text]');

    if (this.db) {
      this.db.prepare('INSERT OR REPLACE INTO group_rules (group_id, rules, updated_at) VALUES (?, ?, ?)')
        .run(groupId, rulesText, new Date().toISOString());
    }

    return reply('Group rules updated successfully.');
  }

  _checkBannedWords(text) {
    return this.bannedWords.some(word => text.toLowerCase().includes(word));
  }

  _checkSpam(sender) {
    const now = Date.now();
    const timestamps = this.messageTimestamps.get(sender) || [];
    const recent = timestamps.filter(t => now - t < this.spamWindow);
    recent.push(now);
    this.messageTimestamps.set(sender, recent);
    return recent.length > this.spamLimit;
  }

  async _isAdmin(user, groupId) {
    try {
      const meta = await this.sock.groupMetadata(groupId);
      const isOwner = user === this.config.ownerNumber + '@s.whatsapp.net';
      const isAdmin = meta.participants.some(p => p.id === user && (p.admin === 'admin' || p.admin === 'superadmin'));
      return isOwner || isAdmin;
    } catch {
      return false;
    }
  }
}

module.exports = GroupModeration;
