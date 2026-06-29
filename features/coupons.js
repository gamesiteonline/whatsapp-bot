class Coupons {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'coupons';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.coupons !== false;

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS coupons (code TEXT PRIMARY KEY, discount REAL, type TEXT DEFAULT "percentage", expiry TEXT, usage_count INTEGER DEFAULT 0, max_uses INTEGER DEFAULT 100, created_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!coupon')) return false;

    const parts = text.slice(8).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'generate':
        if (!isOwner) return reply('Only the owner can generate coupons.');
        return this._generateCoupon(text.slice(17).trim(), reply);
      case 'validate':
        return this._validateCoupon(parts.slice(1).join(' '), reply);
      case 'apply':
        return this._applyCoupon(parts.slice(1).join(' '), sender, reply);
      case 'list':
        return this._listCoupons(reply);
      default:
        return reply('Commands: generate, validate, apply, list');
    }
  }

  async _generateCoupon(input, reply) {
    const match = input.match(/^(.+?)\|([\d.]+)(?:\|(.+))?$/);
    if (!match) return reply('Usage: !coupon generate [code]|[discount]|[expiry] (expiry optional, or include % for percentage)');

    let [, code, discount, expiry] = match;
    const discountVal = parseFloat(discount);
    if (isNaN(discountVal)) return reply('Invalid discount value.');

    const type = discount.includes('%') ? 'percentage' : 'fixed';

    this.db.prepare('INSERT OR REPLACE INTO coupons (code, discount, type, expiry, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(code.toUpperCase().trim(), discountVal, type, expiry?.trim() || null, new Date().toISOString());

    return reply(`Coupon ${code.toUpperCase().trim()} created: ${discountVal}${type === 'percentage' ? '%' : '$'} off${expiry ? `, expires ${expiry.trim()}` : ''}`);
  }

  async _validateCoupon(code, reply) {
    if (!code) return reply('Usage: !coupon validate [code]');

    const coupon = this.db.prepare('SELECT * FROM coupons WHERE code = ?').get(code.toUpperCase().trim());
    if (!coupon) return reply(`Coupon "${code}" does not exist.`);

    if (coupon.expiry && new Date(coupon.expiry) < new Date()) {
      return reply(`Coupon "${code}" has expired (${coupon.expiry}).`);
    }

    if (coupon.usage_count >= coupon.max_uses) {
      return reply(`Coupon "${code}" has reached its usage limit.`);
    }

    const discText = coupon.type === 'percentage' ? `${coupon.discount}%` : `$${coupon.discount.toFixed(2)}`;
    return reply(`✅ Coupon "${code}" is valid! Discount: ${discText}${coupon.expiry ? ` (expires ${coupon.expiry})` : ''}`);
  }

  async _applyCoupon(code, sender, reply) {
    if (!code) return reply('Usage: !coupon apply [code]');

    const coupon = this.db.prepare('SELECT * FROM coupons WHERE code = ?').get(code.toUpperCase().trim());
    if (!coupon) return reply(`Coupon "${code}" not found.`);

    if (coupon.expiry && new Date(coupon.expiry) < new Date()) {
      return reply(`Coupon "${code}" has expired.`);
    }

    if (coupon.usage_count >= coupon.max_uses) {
      return reply(`Coupon "${code}" usage limit reached.`);
    }

    this.db.prepare('UPDATE coupons SET usage_count = usage_count + 1 WHERE code = ?').run(code.toUpperCase().trim());

    const discText = coupon.type === 'percentage' ? `${coupon.discount}%` : `$${coupon.discount.toFixed(2)}`;
    return reply(`✅ Coupon "${code}" applied! You saved ${discText}.`);
  }

  async _listCoupons(reply) {
    const coupons = this.db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
    if (!coupons.length) return reply('No coupons available.');

    const lines = coupons.map(c => {
      const discText = c.type === 'percentage' ? `${c.discount}%` : `$${c.discount.toFixed(2)}`;
      const status = c.expiry && new Date(c.expiry) < new Date() ? ' (expired)' : ` (${c.usage_count}/${c.max_uses} uses)`;
      return `${c.code} - ${discText} off${status}`;
    });

    return reply(`*Active Coupons:*\n\n${lines.join('\n')}`);
  }
}

module.exports = Coupons;
