class ImageGeneration {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'imageGeneration';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;

    this.styles = ['realistic', 'anime', 'abstract', 'digital-art', 'fantasy', 'pixel-art', 'cyberpunk'];
  }

  get enabled() {
    return this.config.features?.imageGeneration !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!imagine')) {
      const parts = text.split(' ');
      const potentialStyle = (parts[1] || '').toLowerCase();
      let style = 'realistic';
      let promptStart = 1;

      if (this.styles.includes(potentialStyle)) {
        style = potentialStyle;
        promptStart = 2;
      }

      const prompt = parts.slice(promptStart).join(' ').trim();
      if (!prompt) {
        await reply(`🎨 *Image Generation*\n\n!imagine [style] <prompt>\n\nStyles: ${this.styles.join(', ')}\n\nExample: !imagine anime a cat wearing a hat`);
        return true;
      }

      await reply(`🎨 Generating ${style} image...\n*Prompt:* ${prompt}`);

      try {
        const imageUrl = await this.aiRouter.generateImage(prompt, style);
        if (imageUrl) {
          await this.sock.sendMessage(msg.key.remoteJid, {
            image: { url: imageUrl },
            caption: `🎨 *${style}*\n${prompt}`
          });
        } else {
          await reply('❌ Failed to generate image. No URL returned.');
        }
      } catch (err) {
        await reply(`❌ Image generation failed: ${err.message}`);
      }

      return true;
    }

    return false;
  }
}

module.exports = ImageGeneration;
