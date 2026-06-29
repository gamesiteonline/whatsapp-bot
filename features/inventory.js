class Inventory {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'inventory';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.inventory !== false;

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS inventory (sku TEXT PRIMARY KEY, name TEXT, qty INTEGER DEFAULT 0, price REAL DEFAULT 0, created_at TEXT, updated_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!stock')) return false;

    const cmd = text.slice(7).trim().split(' ')[0];

    switch (cmd) {
      case 'add':
        if (!isOwner) return reply('Only the owner can add products.');
        return this._addProduct(text.slice(11).trim(), reply);
      case 'update':
        if (!isOwner) return reply('Only the owner can update stock.');
        return this._updateStock(text.slice(14).trim(), reply);
      case 'low':
        return this._lowStock(reply);
      case 'list':
        return this._listProducts(reply);
      default:
        if (cmd) return this._checkStock(cmd, reply);
        return reply('Commands: !stock [sku], !stock add, !stock update, !stock low, !stock list');
    }
  }

  async _addProduct(input, reply) {
    const match = input.match(/^(.+?)\|(.+?)\|(\d+)\|([\d.]+)$/);
    if (!match) return reply('Usage: !stock add [name]|[sku]|[qty]|[price]');

    const [, name, sku, qty, price] = match;
    const existing = this.db.prepare('SELECT * FROM inventory WHERE sku = ?').get(sku.trim());
    if (existing) return reply(`Product with SKU "${sku.trim()}" already exists.`);

    this.db.prepare('INSERT INTO inventory (sku, name, qty, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sku.trim(), name.trim(), parseInt(qty), parseFloat(price), new Date().toISOString(), new Date().toISOString());

    return reply(`Product added: ${name.trim()} (SKU: ${sku.trim()}), Qty: ${qty}, Price: $${parseFloat(price).toFixed(2)}`);
  }

  async _updateStock(input, reply) {
    const match = input.match(/^(.+?)\|(\d+)$/);
    if (!match) return reply('Usage: !stock update [sku]|[qty]');

    const [, sku, qty] = match;
    const existing = this.db.prepare('SELECT * FROM inventory WHERE sku = ?').get(sku.trim());
    if (!existing) return reply(`Product "${sku.trim()}" not found.`);

    this.db.prepare('UPDATE inventory SET qty = ?, updated_at = ? WHERE sku = ?')
      .run(parseInt(qty), new Date().toISOString(), sku.trim());

    return reply(`Stock updated: ${existing.name} (SKU: ${sku.trim()}) now has ${qty} units.`);
  }

  async _checkStock(sku, reply) {
    const product = this.db.prepare('SELECT * FROM inventory WHERE sku = ?').get(sku);
    if (!product) return reply(`Product "${sku}" not found.`);

    const low = product.qty < 5 ? ' ⚠️ LOW STOCK' : '';
    return reply(
      `*${product.name}*\n` +
      `SKU: ${product.sku}\n` +
      `Qty: ${product.qty}${low}\n` +
      `Price: $${product.price.toFixed(2)}`
    );
  }

  async _lowStock(reply) {
    const items = this.db.prepare('SELECT * FROM inventory WHERE qty < 5 ORDER BY qty ASC').all();
    if (!items.length) return reply('No low stock items.');

    const lines = items.map(i => `${i.name} (${i.sku}) - ${i.qty} remaining`);
    return reply(`*Low Stock Items (< 5):*\n\n${lines.join('\n')}`);
  }

  async _listProducts(reply) {
    const items = this.db.prepare('SELECT * FROM inventory ORDER BY name ASC').all();
    if (!items.length) return reply('No products in inventory.');

    const lines = items.map(i => `${i.name} - SKU: ${i.sku} - Qty: ${i.qty} - $${i.price.toFixed(2)}`);
    return reply(`*Inventory:*\n\n${lines.join('\n')}`);
  }
}

module.exports = Inventory;
