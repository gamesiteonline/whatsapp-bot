class FaqFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'faq';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.faq !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!faq add ')) {
      if (!isOwner) {
        await reply('Only admins can add FAQ entries.');
        return true;
      }
      const content = text.slice('!faq add '.length).trim();
      const sepIdx = content.indexOf('|');
      if (sepIdx === -1) {
        await reply('Usage: !faq add [question]|[answer]');
        return true;
      }
      const question = content.slice(0, sepIdx).trim();
      const answer = content.slice(sepIdx + 1).trim();
      if (!question || !answer) {
        await reply('Both question and answer are required.');
        return true;
      }
      try {
        const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        await this.db.run(
          'INSERT INTO faq_entries (question, answer, keywords, created_by, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
          [question, answer, JSON.stringify(keywords), sender]
        );
        await reply(`FAQ added: "${question}"`);
      } catch (err) {
        await reply('Failed to add FAQ entry.');
      }
      return true;
    }

    const match = lower.match(/^!faq\s+(.+)/);
    if (match) {
      const query = match[1].trim();
      const entry = await this.findMatch(query);
      if (entry) {
        await reply(entry.answer);
      } else {
        await reply('No matching FAQ found. Try rephrasing your question.');
      }
      return true;
    }

    const faqEntry = await this.findMatch(lower);
    if (faqEntry) {
      await reply(faqEntry.answer);
      return true;
    }

    if (this.config.faq?.useAiFallback) {
      try {
        const answer = await this.aiRouter.ask(`Answer this question concisely for a business FAQ: ${text}`, {
          sender,
          systemPrompt: 'You are a helpful FAQ assistant. Provide concise, accurate answers.'
        });
        await reply(answer);
        if (this.config.faq?.autoStoreNew && isOwner) {
          const keywords = lower.split(/\s+/).filter(w => w.length > 3);
          await this.db.run(
            'INSERT INTO faq_entries (question, answer, keywords, created_by, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
            [text, answer, JSON.stringify(keywords), sender]
          );
        }
      } catch (err) {
        return false;
      }
      return true;
    }

    return false;
  }

  async findMatch(query) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const entries = await this.db.all('SELECT * FROM faq_entries');
    let bestScore = 0;
    let bestEntry = null;

    for (const entry of entries) {
      let keywords;
      try {
        keywords = JSON.parse(entry.keywords || '[]');
      } catch {
        keywords = entry.question ? entry.question.toLowerCase().split(/\s+/).filter(w => w.length > 2) : [];
      }
      let score = 0;
      for (const word of words) {
        if (keywords.includes(word)) score += 2;
        if (entry.question && entry.question.toLowerCase().includes(word)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    }

    const threshold = this.config.faq?.matchThreshold || 2;
    return bestScore >= threshold ? bestEntry : null;
  }
}

module.exports = FaqFeature;
