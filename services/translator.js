const translate = require('@iamtraction/google-translate');

class Translator {
  async translate(text, targetLang) {
    try {
      const result = await translate(text, { to: targetLang });
      return result.text;
    } catch (err) {
      throw new Error(`Translation failed: ${err.message}`);
    }
  }

  async detect(text) {
    try {
      const result = await translate(text, { to: 'en' });
      return result.from.language.iso;
    } catch (err) {
      throw new Error(`Language detection failed: ${err.message}`);
    }
  }
}

module.exports = Translator;
