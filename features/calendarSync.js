class CalendarSync {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'calendarSync';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.calendarSync !== false;

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, title TEXT, event_date TEXT, event_time TEXT, description TEXT, created_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!calendar')) return false;

    const parts = text.slice(10).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'today':
        return this._showDate(new Date(), sender, reply);
      case 'week':
        return this._showWeek(sender, reply);
      case 'add':
        return this._addEvent(text.slice(14).trim(), sender, reply);
      case 'remove':
        return this._removeEvent(parts[1], sender, reply);
      case 'link':
        return this._linkCalendar(reply);
      default:
        return reply('Commands: today, week, add, remove, link');
    }
  }

  async _showDate(date, sender, reply) {
    const dateStr = date.toISOString().split('T')[0];
    const events = this.db
      ? this.db.prepare('SELECT * FROM calendar_events WHERE user = ? AND event_date = ? ORDER BY event_time ASC').all(sender, dateStr)
      : [];

    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const formatted = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    if (!events.length) {
      return reply(`*${dayName}, ${formatted}*\n\nNo events scheduled.`);
    }

    const lines = events.map(e => `🕐 ${e.event_time || 'All day'} - ${e.title}${e.description ? ` (${e.description})` : ''}`);
    return reply(`*${dayName}, ${formatted}*\n\n${lines.join('\n')}`);
  }

  async _showWeek(sender, reply) {
    const today = new Date();
    const weekEvents = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const events = this.db
        ? this.db.prepare('SELECT * FROM calendar_events WHERE user = ? AND event_date = ? ORDER BY event_time ASC').all(sender, dateStr)
        : [];

      if (events.length) {
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const dayEvents = events.map(e => `  🕐 ${e.event_time || 'All day'} - ${e.title}`).join('\n');
        weekEvents.push(`*${dayName} ${dateStr}:*\n${dayEvents}`);
      }
    }

    if (!weekEvents.length) {
      return reply('No events this week.');
    }

    return reply(`*This Week's Events:*\n\n${weekEvents.join('\n\n')}`);
  }

  async _addEvent(input, sender, reply) {
    const match = input.match(/^(\S+)\s+(\S+)\s+(.+)$/s);
    if (!match) return reply('Usage: !calendar add [date YYYY-MM-DD] [time HH:MM] [event title]');

    const [, date, time, title] = match;

    try {
      new Date(date).toISOString();
    } catch {
      return reply('Invalid date format. Use YYYY-MM-DD.');
    }

    this.db.prepare('INSERT INTO calendar_events (user, title, event_date, event_time, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(sender, title.trim(), date, time, new Date().toISOString());

    return reply(`✅ Event added: "${title.trim()}" on ${date} at ${time}`);
  }

  async _removeEvent(id, sender, reply) {
    if (!id) return reply('Usage: !calendar remove [id]');

    const event = this.db.prepare('SELECT * FROM calendar_events WHERE id = ? AND user = ?').get(id, sender);
    if (!event) return reply(`Event #${id} not found.`);

    this.db.prepare('DELETE FROM calendar_events WHERE id = ? AND user = ?').run(id, sender);
    return reply(`🗑️ Removed event: ${event.title} (${event.event_date})`);
  }

  async _linkCalendar(reply) {
    return reply(
      '📅 Google Calendar Sync\n\n' +
      'To connect Google Calendar:\n' +
      '1. Go to https://console.cloud.google.com/\n' +
      '2. Create a project and enable Google Calendar API\n' +
      '3. Create OAuth 2.0 credentials\n' +
      '4. Add your credentials to the bot config\n\n' +
      'Currently using local calendar storage only.'
    );
  }
}

module.exports = CalendarSync;
