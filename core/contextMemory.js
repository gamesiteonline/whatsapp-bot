const { getDb } = require('../database/db');

const MAX_MESSAGES = 20;

class ContextMemory {
  get(userJid) {
    const row = getDb().prepare('SELECT messages FROM conversations WHERE user_jid = ?').get(userJid);
    if (!row) return [];
    try {
      return JSON.parse(row.messages) || [];
    } catch {
      return [];
    }
  }

  add(userJid, role, content) {
    const existing = this.get(userJid);
    existing.push({ role, content, timestamp: new Date().toISOString() });

    if (existing.length > MAX_MESSAGES) {
      existing.splice(0, existing.length - MAX_MESSAGES);
    }

    const messagesJson = JSON.stringify(existing);
    getDb().prepare(`
      INSERT INTO conversations (user_jid, messages, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_jid) DO UPDATE SET
        messages = excluded.messages,
        updated_at = CURRENT_TIMESTAMP
    `).run(userJid, messagesJson);
  }

  clear(userJid) {
    getDb().prepare('DELETE FROM conversations WHERE user_jid = ?').run(userJid);
  }

  getContextForAI(userJid) {
    const messages = this.get(userJid);
    return messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }
}

module.exports = ContextMemory;
