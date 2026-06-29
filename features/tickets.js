class Tickets {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'tickets';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.tickets !== false;

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, subject TEXT, description TEXT, status TEXT DEFAULT "open", assigned_to TEXT, replies TEXT DEFAULT "[]", created_at TEXT, updated_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();

    if (!lower.startsWith('!ticket')) return false;

    const parts = text.slice(8).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'open':
        return this._openTicket(text.slice(13).trim(), sender, reply);
      case 'close':
        return this._closeTicket(parts[1], sender, reply);
      case 'view':
        return this._viewTicket(parts[1], sender, reply);
      case 'list':
        return this._listTickets(sender, reply);
      case 'assign':
        return this._assignTicket(parts[1], parts.slice(2).join(' '), sender, isOwner, reply);
      case 'reply':
        return this._replyTicket(parts[1], text.slice(8 + 6 + parts[1].length + 1).trim(), sender, reply);
      default:
        return reply('Commands: open, close, view, list, assign, reply');
    }
  }

  async _openTicket(input, sender, reply) {
    const match = input.match(/^(.+?)\|(.+)$/s);
    if (!match) return reply('Usage: !ticket open [subject]|[description]');

    const [, subject, description] = match;
    const result = this.db.prepare('INSERT INTO tickets (user, subject, description, status, created_at, updated_at) VALUES (?, ?, ?, "open", ?, ?)')
      .run(sender, subject.trim(), description.trim(), new Date().toISOString(), new Date().toISOString());

    return reply(`Ticket #${result.lastInsertRowid} opened successfully.\nSubject: ${subject.trim()}\nStatus: Open`);
  }

  async _closeTicket(id, sender, reply) {
    if (!id) return reply('Usage: !ticket close [id]');

    const ticket = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) return reply(`Ticket #${id} not found.`);
    if (ticket.user !== sender && !this.config.ownerNumber?.includes(sender.split('@')[0])) return reply('You can only close your own tickets.');

    this.db.prepare('UPDATE tickets SET status = "closed", updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    return reply(`Ticket #${id} closed.`);
  }

  async _viewTicket(id, sender, reply) {
    if (!id) return reply('Usage: !ticket view [id]');

    const ticket = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) return reply(`Ticket #${id} not found.`);

    const replies = JSON.parse(ticket.replies || '[]');
    const replyText = replies.length
      ? '\n\n*Replies:*\n' + replies.map((r, i) => `[${i + 1}] ${r.author}: ${r.message} (${r.date})`).join('\n')
      : '';

    return reply(
      `*Ticket #${ticket.id}*\n` +
      `*Subject:* ${ticket.subject}\n` +
      `*Status:* ${ticket.status}\n` +
      `*Created:* ${ticket.created_at}\n` +
      `*Description:* ${ticket.description}` +
      replyText
    );
  }

  async _listTickets(sender, reply) {
    const tickets = this.db.prepare('SELECT id, subject, status, created_at FROM tickets WHERE user = ? ORDER BY created_at DESC').all(sender);

    if (!tickets.length) return reply('You have no tickets.');

    const lines = tickets.map(t => `#${t.id} - ${t.subject} [${t.status}] (${t.created_at})`);
    return reply(`*Your Tickets:*\n\n${lines.join('\n')}`);
  }

  async _assignTicket(id, agent, sender, isOwner, reply) {
    if (!isOwner) return reply('Only the owner can assign tickets.');
    if (!id || !agent) return reply('Usage: !ticket assign [id] [agent]');

    const ticket = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) return reply(`Ticket #${id} not found.`);

    this.db.prepare('UPDATE tickets SET assigned_to = ?, status = "in_progress", updated_at = ? WHERE id = ?')
      .run(agent, new Date().toISOString(), id);
    return reply(`Ticket #${id} assigned to ${agent}.`);
  }

  async _replyTicket(id, message, sender, reply) {
    if (!id || !message) return reply('Usage: !ticket reply [id] [message]');

    const ticket = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) return reply(`Ticket #${id} not found.`);

    const replies = JSON.parse(ticket.replies || '[]');
    replies.push({
      author: sender,
      message,
      date: new Date().toISOString(),
    });

    this.db.prepare('UPDATE tickets SET replies = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(replies), new Date().toISOString(), id);
    return reply(`Reply added to ticket #${id}.`);
  }
}

module.exports = Tickets;
