const axios = require('axios');

class AISearch {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'aiSearch';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.aiSearch !== false;
    this.indexedDocs = [];
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!search ')) {
      const query = text.slice(8).trim();
      if (!query) return reply('Usage: !search [query]');

      return this._handleSearch(query, reply);
    }

    if (lower.startsWith('!docs ')) {
      if (!isOwner) return reply('Only the owner can index documents.');

      const url = text.slice(6).trim();
      if (!url) return reply('Usage: !docs [url]');

      return this._handleIndexDocs(url, reply);
    }

    return false;
  }

  async _handleSearch(query, reply) {
    await reply(`Searching for "${query}"...`);

    try {
      const localResult = await this._searchLocalFAQ(query);
      if (localResult) {
        return reply(`*Local FAQ Result:*\n${localResult}`);
      }
    } catch {
    }

    try {
      const webResult = await this._searchWeb(query);
      if (webResult) {
        const summary = await this._summarizeWithAI(query, webResult);
        return reply(`*Search Result:*\n${summary}`);
      }
      return reply('No results found.');
    } catch (err) {
      return reply(`Search failed: ${err.message}`);
    }
  }

  async _searchLocalFAQ(query) {
    if (!this.db) return null;

    const rows = this.db.prepare('SELECT question, answer FROM faq WHERE question LIKE ? OR answer LIKE ? LIMIT 1');
    const row = rows.get(`%${query}%`, `%${query}%`);

    return row ? `*Q:* ${row.question}\n*A:* ${row.answer}` : null;
  }

  async _searchWeb(query) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const res = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsAppBot/1.0)' },
      timeout: 10000,
    });

    const text = res.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const snippet = text.substring(0, 3000);

    return snippet;
  }

  async _summarizeWithAI(query, text) {
    if (this.aiRouter && typeof this.aiRouter.query === 'function') {
      const prompt = `Query: ${query}\n\nContext: ${text.substring(0, 2000)}\n\nProvide a concise answer based on the context above.`;
      const result = await this.aiRouter.query(prompt, { provider: 'openrouter' });
      return result?.response || result || 'No summary available.';
    }
    return text.substring(0, 500);
  }

  async _handleIndexDocs(url, reply) {
    try {
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      });

      const text = res.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const doc = { url, content: text.substring(0, 5000), indexedAt: new Date().toISOString() };
      this.indexedDocs.push(doc);

      if (this.db) {
        this.db.prepare('CREATE TABLE IF NOT EXISTS indexed_docs (url TEXT PRIMARY KEY, content TEXT, indexed_at TEXT)').run();
        this.db.prepare('INSERT OR REPLACE INTO indexed_docs (url, content, indexed_at) VALUES (?, ?, ?)').run(url, doc.content, doc.indexedAt);
      }

      return reply(`Document indexed successfully (${doc.content.length} chars).`);
    } catch (err) {
      return reply(`Failed to index document: ${err.message}`);
    }
  }
}

module.exports = AISearch;
