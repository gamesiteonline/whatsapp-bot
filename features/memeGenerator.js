class MemeGenerator {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'memeGenerator';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.memeGenerator !== false;

    this.templates = [
      { id: 'drake', name: 'Drake Hotline Bling', bg: '#4A90D9' },
      { id: 'disaster', name: 'Disaster Girl', bg: '#E74C3C' },
      { id: 'doge', name: 'Doge', bg: '#F1C40F' },
      { id: 'fry', name: 'Futurama Fry', bg: '#2ECC71' },
      { id: 'wonka', name: 'Creepy Wonka', bg: '#9B59B6' },
      { id: 'yuno', name: 'Y U No', bg: '#E67E22' },
      { id: 'bad', name: 'Bad Luck Brian', bg: '#1ABC9C' },
      { id: 'grumpy', name: 'Grumpy Cat', bg: '#34495E' },
      { id: 'ermahgerd', name: 'Ermahgerd', bg: '#E91E63' },
      { id: 'success', name: 'Success Kid', bg: '#00BCD4' },
    ];
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!meme')) return false;

    if (lower === '!meme templates') {
      return this._listTemplates(reply);
    }

    const parts = text.slice(6).trim().split('|');
    const templateId = parts[0]?.trim().split(' ')[0];
    const topText = parts[0]?.trim().split(' ').slice(1).join(' ') || '';
    const bottomText = parts[1]?.trim() || '';

    if (!templateId) return reply('Usage: !meme [template] [top text]|[bottom text]\nUse !meme templates to see available templates.');

    return this._generateMeme(templateId, topText, bottomText, reply);
  }

  async _listTemplates(reply) {
    const lines = this.templates.map(t => `${t.id} - ${t.name}`);
    return reply(`*Meme Templates:*\n\n${lines.join('\n')}\n\nUsage: !meme [template] [top text]|[bottom text]`);
  }

  async _generateMeme(templateId, topText, bottomText, reply) {
    const template = this.templates.find(t => t.id === templateId);
    if (!template) return reply(`Template "${templateId}" not found. Use !meme templates to see available.`);

    try {
      const { createCanvas } = require('canvas');
      const width = 500;
      const height = 500;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = template.bg;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';

      const fontSize = Math.min(48, Math.floor(width / Math.max(topText.length, bottomText.length, 1) * 1.5));
      ctx.font = `bold ${fontSize}px Impact, Arial, sans-serif`;

      if (topText) {
        ctx.strokeText(topText, width / 2, 80);
        ctx.fillText(topText, width / 2, 80);
      }

      if (bottomText) {
        ctx.strokeText(bottomText, width / 2, height - 40);
        ctx.fillText(bottomText, width / 2, height - 40);
      }

      if (!topText && !bottomText) {
        const label = template.name;
        ctx.font = `bold 36px Impact, Arial, sans-serif`;
        ctx.strokeText(label, width / 2, height / 2);
        ctx.fillText(label, width / 2, height / 2);
      }

      const buf = canvas.toBuffer('image/png');

      await this.sock.sendMessage(msg.key.remoteJid, {
        image: buf,
        caption: `Meme: ${template.name}`,
      });
    } catch (err) {
      if (err.message.includes('Cannot find module')) {
        return reply("Canvas module not installed. Run: npm install canvas\n\n*Mock Meme:*\nTemplate: " + template.name + "\nTop: \"" + (topText || '(none)') + "\"\nBottom: \"" + (bottomText || '(none)') + "\"");
      }
      return reply(`Meme generation failed: ${err.message}`);
    }
  }
}

module.exports = MemeGenerator;
