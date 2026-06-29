class Invoices {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'invoices';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.invoices !== false;

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT DEFAULT "invoice", user TEXT, items TEXT, amount REAL, customer TEXT, status TEXT DEFAULT "draft", created_at TEXT, updated_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!invoice')) return false;

    const parts = text.slice(9).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'create':
        return this._createInvoice(text.slice(16).trim(), sender, reply);
      case 'view':
        return this._viewInvoice(parts[1], reply);
      case 'send':
        return this._sendInvoice(parts[1], reply);
      case 'list':
        return this._listInvoices(sender, reply);
      default:
        return reply('Commands: create, view, send, list');
    }
  }

  async _createInvoice(input, sender, reply) {
    const match = input.match(/^(.+?)\|(.+?)\|(.+)$/s);
    if (!match) return reply('Usage: !invoice create [items]|[amount]|[customer]');

    const [, items, amount, customer] = match;
    const amt = parseFloat(amount);
    if (isNaN(amt)) return reply('Invalid amount.');

    const result = this.db.prepare('INSERT INTO orders (type, user, items, amount, customer, status, created_at, updated_at) VALUES ("invoice", ?, ?, ?, ?, "draft", ?, ?)')
      .run(sender, items.trim(), amt, customer.trim(), new Date().toISOString(), new Date().toISOString());

    return reply(`Invoice #${result.lastInsertRowid} created.\nItems: ${items.trim()}\nAmount: $${amt.toFixed(2)}\nCustomer: ${customer.trim()}\nUse !invoice send ${result.lastInsertRowid} to send it.`);
  }

  async _viewInvoice(id, reply) {
    if (!id) return reply('Usage: !invoice view [id]');

    const inv = this.db.prepare('SELECT * FROM orders WHERE id = ? AND type = "invoice"').get(id);
    if (!inv) return reply(`Invoice #${id} not found.`);

    return reply(
      `*Invoice #${inv.id}*\n` +
      `*Items:* ${inv.items}\n` +
      `*Amount:* $${inv.amount.toFixed(2)}\n` +
      `*Customer:* ${inv.customer}\n` +
      `*Status:* ${inv.status}\n` +
      `*Created:* ${inv.created_at}`
    );
  }

  async _sendInvoice(id, reply) {
    if (!id) return reply('Usage: !invoice send [id]');

    const inv = this.db.prepare('SELECT * FROM orders WHERE id = ? AND type = "invoice"').get(id);
    if (!inv) return reply(`Invoice #${id} not found.`);

    try {
      const pdfBuffer = await this._generatePDF(inv);
      this.db.prepare('UPDATE orders SET status = "sent", updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);

      await this.sock.sendMessage(inv.user, {
        document: pdfBuffer,
        fileName: `invoice_${id}.pdf`,
        mimetype: 'application/pdf',
        caption: `Your Invoice #${id} from ${this.config.botName || 'Shop'}`,
      });

      return reply(`Invoice #${id} sent to customer.`);
    } catch (err) {
      return reply(`Failed to send invoice: ${err.message}`);
    }
  }

  async _generatePDF(invoice) {
    const PDFGenerator = this.utils?.pdfGenerator;
    if (PDFGenerator && typeof PDFGenerator.generate === 'function') {
      return PDFGenerator.generate({
        title: `Invoice #${invoice.id}`,
        content: [
          { text: `Items: ${invoice.items}`, style: 'normal' },
          { text: `Amount: $${invoice.amount.toFixed(2)}`, style: 'bold' },
          { text: `Customer: ${invoice.customer}`, style: 'normal' },
          { text: `Date: ${invoice.created_at}`, style: 'normal' },
        ],
      });
    }

    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    page.drawText(`Invoice #${invoice.id}`, { x: 50, y: 250, size: 20 });
    page.drawText(`Items: ${invoice.items}`, { x: 50, y: 200, size: 12 });
    page.drawText(`Amount: $${invoice.amount.toFixed(2)}`, { x: 50, y: 180, size: 12 });
    page.drawText(`Customer: ${invoice.customer}`, { x: 50, y: 160, size: 12 });
    page.drawText(`Date: ${invoice.created_at}`, { x: 50, y: 140, size: 10 });
    const buf = await doc.save();
    return Buffer.from(buf);
  }

  async _listInvoices(sender, reply) {
    const invoices = this.db.prepare('SELECT id, items, amount, customer, status, created_at FROM orders WHERE type = "invoice" AND user = ? ORDER BY created_at DESC').all(sender);
    if (!invoices.length) return reply('No invoices found.');

    const lines = invoices.map(i => `#${i.id} - ${i.items} - $${i.amount.toFixed(2)} - ${i.customer} [${i.status}]`);
    return reply(`*Your Invoices:*\n\n${lines.join('\n')}`);
  }
}

module.exports = Invoices;
