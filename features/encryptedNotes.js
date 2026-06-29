const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

class EncryptedNotes {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'encryptedNotes';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;

    const secret = config.encryptionSecret || 'default-secret-change-me-in-production';
    this.key = crypto.createHash('sha256').update(secret).digest();
  }

  get enabled() {
    return this.config.features?.encryptedNotes !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!note')) {
      const parts = text.split(' ');
      const sub = (parts[1] || '').toLowerCase();

      if (sub === 'create') {
        const rest = text.slice(parts[0].length + parts[1].length + 1).trim();
        const sepIdx = rest.indexOf('|');
        if (sepIdx === -1) {
          await reply('❌ Usage: !note create <title>|<content>');
          return true;
        }
        const title = rest.substring(0, sepIdx).trim() || 'Untitled';
        const content = rest.substring(sepIdx + 1).trim();
        if (!content) {
          await reply('❌ Note content cannot be empty.');
          return true;
        }

        const { encrypted, iv, tag } = this._encrypt(content);
        const noteId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        const note = {
          id: noteId, title,
          encrypted, iv: iv.toString('hex'), tag: tag.toString('hex'),
          owner: sender, createdAt: new Date().toISOString(), sharedWith: []
        };

        const notes = await this.db.get(`notes:${sender}`) || [];
        notes.push(note);
        await this.db.set(`notes:${sender}`, notes);
        await reply(`✅ Note created!\nID: ${noteId}\nTitle: ${title}`);
        return true;
      }

      if (sub === 'view' && parts[2]) {
        const note = await this._findNote(parts[2], sender);
        if (!note) {
          await reply('❌ Note not found.');
          return true;
        }
        try {
          const decrypted = this._decrypt(note.encrypted, Buffer.from(note.iv, 'hex'), Buffer.from(note.tag, 'hex'));
          await reply(`📝 *${note.title}*\n\n${decrypted}\n\n_ID: ${note.id}_`);
        } catch (e) {
          await reply('❌ Failed to decrypt note.');
        }
        return true;
      }

      if (sub === 'list') {
        const notes = await this.db.get(`notes:${sender}`) || [];
        if (notes.length === 0) {
          await reply('📭 No notes found.');
          return true;
        }
        let listMsg = '📋 *Your Notes*\n\n';
        notes.forEach((n, i) => {
          listMsg += `${i + 1}. *${n.title}* (ID: ${n.id})\n   Created: ${new Date(n.createdAt).toLocaleDateString()}\n`;
        });
        await reply(listMsg);
        return true;
      }

      if (sub === 'delete' && parts[2]) {
        const notes = await this.db.get(`notes:${sender}`) || [];
        const idx = notes.findIndex(n => n.id === parts[2]);
        if (idx === -1) {
          await reply('❌ Note not found.');
          return true;
        }
        notes.splice(idx, 1);
        await this.db.set(`notes:${sender}`, notes);
        await reply('✅ Note deleted.');
        return true;
      }

      if (sub === 'share' && parts[2] && parts[3]) {
        const target = this._extractUser(parts[3]);
        if (!target) {
          await reply('❌ Invalid user. Use @mention.');
          return true;
        }
        const notes = await this.db.get(`notes:${sender}`) || [];
        const note = notes.find(n => n.id === parts[2]);
        if (!note) {
          await reply('❌ Note not found.');
          return true;
        }
        const sharedNotes = await this.db.get(`sharednotes:${target}`) || [];
        sharedNotes.push({ ...note, sharedBy: sender });
        await this.db.set(`sharednotes:${target}`, sharedNotes);
        await reply(`✅ Note "${note.title}" shared with @${target.split('@')[0]}.`);
        return true;
      }

      await reply('📝 *Encrypted Notes*\n\n!note create <title>|<content>\n!note view <id>\n!note list\n!note delete <id>\n!note share <id> @user');
      return true;
    }

    return false;
  }

  async _findNote(noteId, sender) {
    const notes = await this.db.get(`notes:${sender}`) || [];
    const shared = await this.db.get(`sharednotes:${sender}`) || [];
    return notes.find(n => n.id === noteId) || shared.find(n => n.id === noteId);
  }

  _encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { encrypted, iv, tag: cipher.getAuthTag() };
  }

  _decrypt(encrypted, iv, tag) {
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  _extractUser(str) {
    const match = str.match(/@(\d+)/);
    if (match) return match[1] + '@s.whatsapp.net';
    return null;
  }
}

module.exports = EncryptedNotes;
