class VirtualPet {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'virtualPet';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.virtualPet !== false;

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, type TEXT, data TEXT, created_at TEXT, updated_at TEXT)').run();
      } catch {}

      setInterval(() => this._decayStats(), 60 * 60 * 1000);
    }
  }

  _getPet(user) {
    if (!this.db) return null;
    const row = this.db.prepare("SELECT * FROM games WHERE user = ? AND type = 'pet'").get(user);
    return row ? JSON.parse(row.data) : null;
  }

  _savePet(user, pet) {
    if (!this.db) return;
    const existing = this.db.prepare("SELECT id FROM games WHERE user = ? AND type = 'pet'").get(user);
    const data = JSON.stringify(pet);
    const now = new Date().toISOString();

    if (existing) {
      this.db.prepare('UPDATE games SET data = ?, updated_at = ? WHERE user = ? AND type = ?').run(data, now, user, 'pet');
    } else {
      this.db.prepare('INSERT INTO games (user, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(user, 'pet', data, now, now);
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!pet')) return false;

    const parts = text.slice(5).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'adopt':
        return this._adopt(parts.slice(1).join(' '), sender, reply);
      case 'feed':
        return this._feed(sender, reply);
      case 'play':
        return this._play(sender, reply);
      case 'status':
        return this._status(sender, reply);
      case 'rename':
        return this._rename(parts.slice(1).join(' '), sender, reply);
      default:
        return reply('Commands: adopt, feed, play, status, rename');
    }
  }

  async _adopt(name, sender, reply) {
    if (!name) return reply('Usage: !pet adopt [name]');

    const existing = this._getPet(sender);
    if (existing) return reply(`You already have a pet named ${existing.name}.`);

    const pet = {
      name: name.trim(),
      happiness: 100,
      hunger: 0,
      energy: 100,
      level: 1,
      experience: 0,
      lastUpdated: Date.now(),
    };

    this._savePet(sender, pet);
    return reply(`🎉 You adopted ${pet.name}! Take care of them!\n\nUse !pet feed, !pet play, !pet status`);
  }

  async _feed(sender, reply) {
    const pet = this._getPet(sender);
    if (!pet) return reply('You have no pet. Adopt one with !pet adopt [name].');

    pet.hunger = Math.max(0, pet.hunger - 30);
    pet.energy = Math.min(100, pet.energy + 10);
    pet.lastUpdated = Date.now();
    this._savePet(sender, pet);

    return reply(`🍽️ You fed ${pet.name}! Hunger decreased, energy increased slightly.`);
  }

  async _play(sender, reply) {
    const pet = this._getPet(sender);
    if (!pet) return reply('You have no pet. Adopt one with !pet adopt [name].');

    if (pet.energy < 20) return reply(`${pet.name} is too tired to play. Feed them first!`);

    pet.happiness = Math.min(100, pet.happiness + 20);
    pet.energy = Math.max(0, pet.energy - 15);
    pet.hunger = Math.min(100, pet.hunger + 10);
    pet.experience += 10;

    if (pet.experience >= pet.level * 50) {
      pet.level++;
      pet.experience = 0;
      pet.lastUpdated = Date.now();
      this._savePet(sender, pet);
      return reply(`🎮 You played with ${pet.name}! ${pet.name} leveled up to level ${pet.level}!`);
    }

    pet.lastUpdated = Date.now();
    this._savePet(sender, pet);
    return reply(`🎮 You played with ${pet.name}! Happiness increased, energy decreased.`);
  }

  async _status(sender, reply) {
    const pet = this._getPet(sender);
    if (!pet) return reply('You have no pet. Adopt one with !pet adopt [name].');

    const happinessBar = '🟩'.repeat(Math.round(pet.happiness / 10)) + '⬜'.repeat(10 - Math.round(pet.happiness / 10));
    const hungerBar = '🟥'.repeat(Math.round(pet.hunger / 10)) + '⬜'.repeat(10 - Math.round(pet.hunger / 10));
    const energyBar = '🟦'.repeat(Math.round(pet.energy / 10)) + '⬜'.repeat(10 - Math.round(pet.energy / 10));

    return reply(
      `*${pet.name}* - Level ${pet.level}\n\n` +
      `❤️ Happiness: ${pet.happiness}/100\n${happinessBar}\n\n` +
      `🍖 Hunger: ${pet.hunger}/100\n${hungerBar}\n\n` +
      `⚡ Energy: ${pet.energy}/100\n${energyBar}\n\n` +
      `⭐ XP: ${pet.experience}/${pet.level * 50}`
    );
  }

  async _rename(name, sender, reply) {
    if (!name) return reply('Usage: !pet rename [name]');

    const pet = this._getPet(sender);
    if (!pet) return reply('You have no pet.');

    const oldName = pet.name;
    pet.name = name.trim();
    pet.lastUpdated = Date.now();
    this._savePet(sender, pet);

    return reply(`${oldName} has been renamed to ${pet.name}!`);
  }

  _decayStats() {
    if (!this.db) return;

    try {
      const pets = this.db.prepare("SELECT * FROM games WHERE type = 'pet'").all();
      const now = Date.now();

      for (const row of pets) {
        const pet = JSON.parse(row.data);
        const hoursSinceUpdate = (now - pet.lastUpdated) / (1000 * 60 * 60);

        if (hoursSinceUpdate >= 1) {
          pet.happiness = Math.max(0, pet.happiness - 5 * hoursSinceUpdate);
          pet.hunger = Math.min(100, pet.hunger + 8 * hoursSinceUpdate);
          pet.energy = Math.max(0, pet.energy - 3 * hoursSinceUpdate);
          pet.lastUpdated = now;
          this._savePet(row.user, pet);
        }
      }
    } catch {}
  }
}

module.exports = VirtualPet;
