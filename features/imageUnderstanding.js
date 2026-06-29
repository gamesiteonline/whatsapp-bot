const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

class ImageUnderstanding {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'imageUnderstanding';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this._lastImageMsg = null;
  }

  get enabled() {
    return this.config.features?.imageUnderstanding !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    const lower = text.toLowerCase().trim();

    if (msg.message?.imageMessage) {
      this._lastImageMsg = msg;
      return false;
    }

    if (lower.startsWith('!describe') || lower.startsWith('!analyze') || lower.startsWith('!ocr')) {
      const cmd = lower.split(' ')[0];

      if (!this._lastImageMsg) {
        await reply('❌ No recent image found. Send an image first.');
        return true;
      }

      const caption = text.slice(cmd.length).trim();
      let prompt;

      if (cmd === '!describe') {
        prompt = caption
          ? `Describe this image in detail, focusing on: ${caption}`
          : 'Describe this image in detail, including objects, people, setting, colors, and any text visible.';
      } else if (cmd === '!analyze') {
        prompt = caption || 'Analyze this image. Identify all objects, detect text, describe the scene, colors, lighting, and composition.';
      } else {
        prompt = 'Extract all text visible in this image. Return only the extracted text.';
      }

      await reply(`🔍 ${cmd === '!ocr' ? 'Extracting text from image...' : 'Analyzing image...'}`);

      try {
        const stream = await downloadContentFromMessage(this._lastImageMsg.message.imageMessage, 'image');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const imgBuffer = Buffer.concat(chunks);
        const mime = this._lastImageMsg.message.imageMessage.mimetype || 'image/jpeg';
        const dataUri = `data:${mime};base64,${imgBuffer.toString('base64')}`;

        const result = await this.aiRouter.analyzeImage(dataUri, prompt);
        if (result) {
          await reply(cmd === '!ocr'
            ? `📄 *Extracted Text:*\n\n${result}`
            : `🖼️ *Image ${cmd === '!describe' ? 'Description' : 'Analysis'}*\n\n${result}`);
        } else {
          await reply('❌ Could not analyze the image.');
        }
      } catch (err) {
        await reply(`❌ Image analysis failed: ${err.message}`);
      }

      return true;
    }

    return false;
  }
}

module.exports = ImageUnderstanding;
