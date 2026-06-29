class Analytics {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'analytics';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.analytics !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!analytics')) return false;
    if (!isOwner) return reply('Only the owner can access analytics.');

    const cmd = text.slice(11).trim().split(' ')[0];

    switch (cmd) {
      case 'overview':
        return this._overview(reply);
      case 'commands':
        return this._commands(reply);
      case 'users':
        return this._users(reply);
      case 'export':
        return this._export(sender, reply);
      default:
        return reply('Commands: overview, commands, users, export');
    }
  }

  async _overview(reply) {
    const totalUsers = this.db ? this.db.prepare("SELECT COUNT(DISTINCT user) as c FROM game_scores").get()?.c || 0 : 0;
    const totalTickets = this.db ? this.db.prepare("SELECT COUNT(*) as c FROM tickets").get()?.c || 0 : 0;
    const totalInvoices = this.db ? this.db.prepare("SELECT COUNT(*) as c FROM orders WHERE type='invoice'").get()?.c || 0 : 0;
    const totalProducts = this.db ? this.db.prepare("SELECT COUNT(*) as c FROM inventory").get()?.c || 0 : 0;

    return reply(
      `*Analytics Overview*\n` +
      `Total Users: ${totalUsers}\n` +
      `Tickets Created: ${totalTickets}\n` +
      `Invoices Generated: ${totalInvoices}\n` +
      `Products in Inventory: ${totalProducts}\n` +
      `Bot Uptime: Active`
    );
  }

  async _commands(reply) {
    return reply('*Most Used Commands*\n' +
      '1. !trivia - 150 uses\n' +
      '2. !weather - 120 uses\n' +
      '3. !stock - 95 uses\n' +
      '4. !ticket - 80 uses\n' +
      '5. !crypto - 65 uses\n' +
      '(Sample data - implement command logging for live stats)');
  }

  async _users(reply) {
    const activeSubs = this.db ? this.db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status='active'").get()?.c || 0 : 0;
    const totalScores = this.db ? this.db.prepare("SELECT COUNT(*) as c FROM game_scores").get()?.c || 0 : 0;

    return reply(
      `*User Growth Stats*\n` +
      `Active Subscriptions: ${activeSubs}\n` +
      `Users with Game Scores: ${totalScores}\n` +
      `Growth Rate: +12% this month (sample)`
    );
  }

  async _export(sender, reply) {
    try {
      const data = {
        overview: { totalUsers: 0, totalTickets: 0, totalInvoices: 0, totalProducts: 0 },
        generatedAt: new Date().toISOString(),
      };

      if (this.db) {
        data.overview.totalUsers = this.db.prepare("SELECT COUNT(DISTINCT user) as c FROM game_scores").get()?.c || 0;
        data.overview.totalTickets = this.db.prepare("SELECT COUNT(*) as c FROM tickets").get()?.c || 0;
        data.overview.totalInvoices = this.db.prepare("SELECT COUNT(*) as c FROM orders WHERE type='invoice'").get()?.c || 0;
        data.overview.totalProducts = this.db.prepare("SELECT COUNT(*) as c FROM inventory").get()?.c || 0;
      }

      const { PDFDocument } = require('pdf-lib');
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 400]);
      page.drawText('Analytics Report', { x: 50, y: 350, size: 20 });
      page.drawText(`Generated: ${data.generatedAt}`, { x: 50, y: 320, size: 10 });
      page.drawText(`Total Users: ${data.overview.totalUsers}`, { x: 50, y: 280, size: 12 });
      page.drawText(`Total Tickets: ${data.overview.totalTickets}`, { x: 50, y: 260, size: 12 });
      page.drawText(`Total Invoices: ${data.overview.totalInvoices}`, { x: 50, y: 240, size: 12 });
      page.drawText(`Total Products: ${data.overview.totalProducts}`, { x: 50, y: 220, size: 12 });

      const pdfBuf = Buffer.from(await doc.save());

      await this.sock.sendMessage(sender, {
        document: pdfBuf,
        fileName: `analytics_${Date.now()}.pdf`,
        mimetype: 'application/pdf',
        caption: 'Analytics Report',
      });

      return reply('Analytics report exported and sent as PDF.');
    } catch (err) {
      return reply(`Failed to export: ${err.message}`);
    }
  }
}

module.exports = Analytics;
