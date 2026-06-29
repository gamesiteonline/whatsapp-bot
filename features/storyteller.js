class Storyteller {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'storyteller';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.storyteller !== false;
    this.genres = ['fantasy', 'sci-fi', 'horror', 'romance', 'adventure'];
    this.userGenres = new Map();
    this.lastStory = new Map();
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!story')) return false;

    const parts = text.slice(7).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'continue':
        return this._continueStory(sender, reply);
      case 'genre':
        return this._setGenre(parts.slice(1).join(' '), sender, reply);
      default:
        return this._generateStory(text.slice(7).trim(), sender, reply);
    }
  }

  async _generateStory(prompt, sender, reply) {
    if (!prompt) return reply('Usage: !story [prompt]\nGenres: fantasy, sci-fi, horror, romance, adventure');

    await reply('📝 Generating story...');

    const genre = this.userGenres.get(sender) || 'fantasy';
    const fullPrompt = `Write a short ${genre} story based on: "${prompt}". Keep it engaging, 2-3 paragraphs.`;

    try {
      let story;

      if (this.aiRouter && typeof this.aiRouter.query === 'function') {
        const result = await this.aiRouter.query(fullPrompt, { provider: 'deepseek' });
        story = result?.response || result || this._mockStory(genre, prompt);
      } else {
        story = this._mockStory(genre, prompt);
      }

      this.lastStory.set(sender, story);
      if (this.contextMemory && typeof this.contextMemory.set === 'function') {
        this.contextMemory.set(sender, 'last_story', story);
      }

      if (story.length > 1000) {
        const chunks = this._chunkText(story, 1000);
        await reply(`*Story (${genre}) - Part 1:*\n\n${chunks[0]}`);
        for (let i = 1; i < chunks.length; i++) {
          await this.sock.sendMessage(msg.key.remoteJid, {
            text: `*Part ${i + 1}:*\n\n${chunks[i]}`,
          });
        }
        return reply('Use !story continue to continue the story.');
      }

      return reply(`*Story (${genre}):*\n\n${story}\n\nUse !story continue to continue.`);
    } catch (err) {
      return reply(`Story generation failed: ${err.message}`);
    }
  }

  async _continueStory(sender, reply) {
    if (!this.contextMemory && !this.lastStory.has(sender)) {
      return reply('No previous story found. Start one with !story [prompt].');
    }

    let lastStory;
    if (this.contextMemory && typeof this.contextMemory.get === 'function') {
      lastStory = this.contextMemory.get(sender, 'last_story');
    }
    if (!lastStory) lastStory = this.lastStory.get(sender);
    if (!lastStory) return reply('No previous story found.');

    const genre = this.userGenres.get(sender) || 'fantasy';
    const prompt = `Continue the following ${genre} story. Add 2-3 more paragraphs:\n\n${lastStory.substring(lastStory.length - 300)}`;

    try {
      let continuation;

      if (this.aiRouter && typeof this.aiRouter.query === 'function') {
        const result = await this.aiRouter.query(prompt, { provider: 'deepseek' });
        continuation = result?.response || result || this._mockStory(genre, 'continuation of a tale about discovery');
      } else {
        continuation = this._mockStory(genre, 'continuation of an epic journey');
      }

      const newStory = lastStory + '\n\n' + continuation;
      this.lastStory.set(sender, newStory);

      return reply(`*Continued Story:*\n\n${continuation}\n\nUse !story continue to continue further.`);
    } catch (err) {
      return reply(`Failed to continue story: ${err.message}`);
    }
  }

  async _setGenre(genre, sender, reply) {
    if (!genre) return reply(`Usage: !story genre [genre]\nAvailable: ${this.genres.join(', ')}`);

    const g = genre.toLowerCase().trim();
    if (!this.genres.includes(g)) return reply(`Genre "${g}" not available. Choose from: ${this.genres.join(', ')}`);

    this.userGenres.set(sender, g);
    return reply(`Genre set to *${g}*. Your stories will now be ${g}-themed.`);
  }

  _mockStory(genre, prompt) {
    const stories = {
      fantasy: `In the realm of Eldoria, ${prompt}. Ancient magic stirred beneath the mountains as the last dragon awoke from its centuries-long slumber. The sky turned crimson as prophecies unfolded, and unlikely heroes emerged from the shadows of the Great Forest.`,
      'sci-fi': `Year 2347. ${prompt}. The quantum beacon pulsed across the Andromeda galaxy, carrying a message that would change humanity's understanding of existence. Aboard the starship Odyssey, the crew prepared for first contact with an intelligence beyond comprehension.`,
      horror: `The old house on Maple Street creaked when ${prompt}. Something lurked in the basement, scratching at the walls, whispering names in languages that predated mankind. The door at the end of the hallway was opening, slowly, deliberately.`,
      romance: `${prompt}. Their eyes met across the rain-soaked platform as the 5:15 train approached. Two strangers bound by circumstance, each carrying a story that the other was destined to complete. The station clock ticked away the seconds before destiny would intervene.`,
      adventure: `${prompt}. The map led through uncharted jungles where ancient temples held secrets of a forgotten civilization. With each step, the expedition pushed deeper into the unknown, driven by the promise of discovery and the thrill of the unexplored.`,
    };

    return stories[genre] || stories.fantasy;
  }

  _chunkText(text, size) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.substring(i, i + size));
    }
    return chunks;
  }
}

module.exports = Storyteller;
