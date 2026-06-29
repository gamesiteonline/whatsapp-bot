class TranslationFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'translation';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.translation !== false;
    this.botLang = config.translation?.defaultLang || 'en';
    this.translator = null;
    try { this.translator = require('../services/translator'); } catch {}
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!translate ')) {
      return this.translateText(text.slice('!translate '.length).trim(), sender, reply);
    }

    if (lower.startsWith('!lang ')) {
      return this.setLanguage(text.slice('!lang '.length).trim(), sender, reply);
    }

    if (lower === '!lang') {
      const userLang = await this.getUserLang(sender);
      await reply(`Your language is set to: ${userLang}. Use !lang [code] to change (e.g., !lang es for Spanish).`);
      return true;
    }

    const userLang = await this.getUserLang(sender);
    if (userLang !== this.botLang && text.length > 2 && !text.startsWith('!') && !isGroup) {
      try {
        const translated = await this.performTranslation(text, this.botLang, userLang);
        if (translated && translated !== text) {
          await reply(`*[Translated to ${userLang}]*\n${translated}`);
          return true;
        }
      } catch {}
    }

    return false;
  }

  async translateText(input, sender, reply) {
    const parts = input.split(/\s+/);
    if (parts.length < 2) {
      await reply('Usage: !translate [lang] [text]\nExample: !translate es Hello, how are you?\n\nSupported codes: en, es, fr, de, it, pt, ja, ko, zh, ar, hi, ru');
      return true;
    }
    const targetLang = parts[0].toLowerCase();
    const textToTranslate = parts.slice(1).join(' ');

    try {
      const translated = await this.performTranslation(textToTranslate, null, targetLang);
      await reply(`*Translation (${targetLang}):*\n${translated}`);
    } catch (err) {
      await reply('Translation failed. Please try again later.');
    }
    return true;
  }

  async setLanguage(langCode, sender, reply) {
    const validLangs = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi', 'ru', 'nl', 'tr', 'pl', 'sv', 'da', 'fi', 'no', 'cs', 'ro', 'hu', 'el', 'he', 'th', 'vi'];
    const code = langCode.toLowerCase();
    if (!validLangs.includes(code)) {
      await reply(`Unsupported language code. Supported: ${validLangs.join(', ')}`);
      return true;
    }
    try {
      const existing = await this.db.get('SELECT * FROM user_languages WHERE user_jid = ?', [sender]);
      if (existing) {
        await this.db.run('UPDATE user_languages SET lang = ? WHERE user_jid = ?', [code, sender]);
      } else {
        await this.db.run('INSERT INTO user_languages (user_jid, lang) VALUES (?, ?)', [sender, code]);
      }
      await reply(`Language set to ${code}.`);
    } catch (err) {
      await reply('Failed to set language preference.');
    }
    return true;
  }

  async getUserLang(sender) {
    try {
      const row = await this.db.get('SELECT lang FROM user_languages WHERE user_jid = ?', [sender]);
      return row ? row.lang : this.botLang;
    } catch {
      return this.botLang;
    }
  }

  async performTranslation(text, sourceLang, targetLang) {
    if (this.translator && typeof this.translator.translate === 'function') {
      return await this.translator.translate(text, sourceLang, targetLang);
    }

    try {
      const prompt = sourceLang
        ? `Translate the following text from ${sourceLang} to ${targetLang}. Return ONLY the translation, no explanations.\n\nText: "${text}"`
        : `Translate the following text to ${targetLang}. Return ONLY the translation, no explanations.\n\nText: "${text}"`;

      const result = await this.aiRouter.ask(prompt, {
        systemPrompt: 'You are a translation engine. Only output the translated text, nothing else.'
      });
      return result.replace(/^["']|["']$/g, '').trim();
    } catch {
      throw new Error('Translation failed');
    }
  }
}

module.exports = TranslationFeature;
