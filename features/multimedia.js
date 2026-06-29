class MultimediaFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'multimedia';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.multimedia !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!send ')) {
      const parts = text.slice('!send '.length).split(/\s+/);
      const type = parts[0].toLowerCase();

      switch (type) {
        case 'image':
          return this.sendImage(parts.slice(1), sender, reply);
        case 'video':
          return this.sendVideo(parts.slice(1), sender, reply);
        case 'audio':
          return this.sendAudio(parts.slice(1), sender, reply);
        case 'pdf':
          return this.sendPdf(parts.slice(1), sender, reply);
        case 'location':
          return this.sendLocation(parts.slice(1), sender, reply);
        default:
          await reply('Unknown media type. Supported: image, video, audio, pdf, location');
          return true;
      }
    }

    if (lower.startsWith('!sticker ')) {
      return this.createSticker(text.slice('!sticker '.length).trim(), msg, sender, reply);
    }

    if (lower === '!sticker' && msg.message?.imageMessage) {
      return this.createStickerFromImage(msg, sender, reply);
    }

    return false;
  }

  async sendImage(args, sender, reply) {
    if (args.length < 1) {
      await reply('Usage: !send image [url] [caption]');
      return true;
    }
    const url = args[0];
    const caption = args.slice(1).join(' ') || '';
    try {
      const response = await this.fetchBuffer(url);
      await this.sock.sendMessage(sender, { image: response, caption });
    } catch {
      await reply('Failed to send image.');
    }
  }

  async sendVideo(args, sender, reply) {
    if (args.length < 1) {
      await reply('Usage: !send video [url] [caption]');
      return true;
    }
    const url = args[0];
    const caption = args.slice(1).join(' ') || '';
    try {
      const response = await this.fetchBuffer(url);
      await this.sock.sendMessage(sender, { video: response, caption });
    } catch {
      await reply('Failed to send video.');
    }
  }

  async sendAudio(args, sender, reply) {
    if (args.length < 1) {
      await reply('Usage: !send audio [url]');
      return true;
    }
    const url = args[0];
    try {
      const response = await this.fetchBuffer(url);
      await this.sock.sendMessage(sender, { audio: response, mimetype: 'audio/mp4' });
    } catch {
      await reply('Failed to send audio.');
    }
  }

  async sendPdf(args, sender, reply) {
    if (args.length < 1) {
      await reply('Usage: !send pdf [url] [title]');
      return true;
    }
    const url = args[0];
    const title = args.slice(1).join(' ') || 'Document';
    try {
      const response = await this.fetchBuffer(url);
      await this.sock.sendMessage(sender, {
        document: response,
        mimetype: 'application/pdf',
        fileName: `${title}.pdf`
      });
    } catch {
      await reply('Failed to send PDF.');
    }
  }

  async sendLocation(args, sender, reply) {
    if (args.length < 2) {
      await reply('Usage: !send location [latitude] [longitude] [label]');
      return true;
    }
    const lat = parseFloat(args[0]);
    const lon = parseFloat(args[1]);
    if (isNaN(lat) || isNaN(lon)) {
      await reply('Invalid coordinates. Use: !send location [lat] [lon] [label]');
      return true;
    }
    const label = args.slice(2).join(' ') || 'Location';
    try {
      await this.sock.sendMessage(sender, {
        location: { degreesLatitude: lat, degreesLongitude: lon },
        caption: label
      });
    } catch {
      await reply('Failed to send location.');
    }
  }

  async createSticker(input, msg, sender, reply) {
    if (!input) {
      await reply('Usage: !sticker [image url] or reply to an image with !sticker');
      return true;
    }
    try {
      const buffer = await this.fetchBuffer(input);
      await this.sock.sendMessage(sender, { sticker: buffer });
    } catch {
      await reply('Failed to create sticker. Make sure the URL points to a valid image.');
    }
  }

  async createStickerFromImage(msg, sender, reply) {
    try {
      const media = await this.sock.downloadMediaMessage(msg);
      await this.sock.sendMessage(sender, { sticker: media });
    } catch {
      await reply('Failed to create sticker from the image.');
    }
  }

  async fetchBuffer(url) {
    const https = require('https');
    const http = require('http');
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });
  }
}

module.exports = MultimediaFeature;
