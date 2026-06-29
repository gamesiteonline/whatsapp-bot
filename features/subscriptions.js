class Subscriptions {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'subscriptions';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.subscriptions !== false;

    this.plans = {
      basic: { name: 'Basic', price: 0, interval: 'forever', features: ['Basic support', 'Limited commands'] },
      premium: { name: 'Premium', price: 9.99, interval: 'monthly', features: ['Priority support', 'All commands', 'Advanced analytics'] },
      enterprise: { name: 'Enterprise', price: 29.99, interval: 'monthly', features: ['Dedicated support', 'All features', 'Custom integrations', 'SLA'] },
    };

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, plan TEXT, status TEXT DEFAULT "active", start_date TEXT, end_date TEXT, auto_renew INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!sub')) return false;

    const parts = text.slice(5).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'plans':
        return this._showPlans(reply);
      case 'subscribe':
        return this._subscribe(parts[1], sender, reply);
      case 'cancel':
        return this._cancel(sender, reply);
      case 'status':
        return this._status(sender, reply);
      case 'renew':
        return this._renew(sender, reply);
      default:
        return reply('Commands: plans, subscribe, cancel, status, renew');
    }
  }

  async _showPlans(reply) {
    const lines = Object.entries(this.plans).map(([key, plan]) => {
      const price = plan.price === 0 ? 'Free' : `$${plan.price.toFixed(2)}/${plan.interval}`;
      return `*${plan.name}* (${key}) - ${price}\nFeatures: ${plan.features.join(', ')}`;
    });
    return reply(`*Available Plans:*\n\n${lines.join('\n\n')}\n\nUse !sub subscribe [plan] to subscribe.`);
  }

  async _subscribe(planKey, sender, reply) {
    if (!planKey || !this.plans[planKey]) return reply('Invalid plan. Available: basic, premium, enterprise');

    const existing = this.db.prepare('SELECT * FROM subscriptions WHERE user = ? AND status = "active"').get(sender);
    if (existing) return reply('You already have an active subscription. Cancel it first with !sub cancel.');

    const plan = this.plans[planKey];
    const startDate = new Date();
    const endDate = plan.interval === 'forever' ? null : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    this.db.prepare('INSERT INTO subscriptions (user, plan, status, start_date, end_date, auto_renew, created_at, updated_at) VALUES (?, ?, "active", ?, ?, 1, ?, ?)')
      .run(sender, planKey, startDate.toISOString(), endDate?.toISOString() || null, startDate.toISOString(), startDate.toISOString());

    const priceText = plan.price === 0 ? 'free' : `$${plan.price.toFixed(2)}/${plan.interval}`;
    return reply(`✅ Subscribed to ${plan.name} (${priceText})!${endDate ? ` Expires: ${endDate.toISOString()}` : ''}`);
  }

  async _cancel(sender, reply) {
    const sub = this.db.prepare('SELECT * FROM subscriptions WHERE user = ? AND status = "active"').get(sender);
    if (!sub) return reply('You have no active subscription to cancel.');

    this.db.prepare('UPDATE subscriptions SET status = "cancelled", auto_renew = 0, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), sub.id);

    return reply('Your subscription has been cancelled. It will remain active until the end of the billing period.');
  }

  async _status(sender, reply) {
    const sub = this.db.prepare('SELECT * FROM subscriptions WHERE user = ? AND status = "active"').get(sender);
    if (!sub) return reply('You have no active subscription.');

    const plan = this.plans[sub.plan];
    const expires = sub.end_date ? `\nExpires: ${sub.end_date}` : '\nLifetime';
    const daysLeft = sub.end_date ? Math.max(0, Math.ceil((new Date(sub.end_date) - new Date()) / (1000 * 60 * 60 * 24))) : '∞';

    return reply(
      `*Subscription Status*\n` +
      `Plan: ${plan.name}\n` +
      `Price: ${plan.price === 0 ? 'Free' : `$${plan.price.toFixed(2)}/${plan.interval}`}` +
      expires +
      `\nDays remaining: ${daysLeft}`
    );
  }

  async _renew(sender, reply) {
    const sub = this.db.prepare('SELECT * FROM subscriptions WHERE user = ? ORDER BY id DESC LIMIT 1').get(sender);
    if (!sub) return reply('No previous subscription found. Use !sub subscribe [plan] first.');

    const plan = this.plans[sub.plan];
    if (!plan) return reply('Invalid plan.');

    if (plan.price === 0) return reply('Basic plan is free and does not need renewal.');

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    this.db.prepare('UPDATE subscriptions SET status = "active", start_date = ?, end_date = ?, auto_renew = 1, updated_at = ? WHERE user = ? ORDER BY id DESC LIMIT 1')
      .run(startDate.toISOString(), endDate.toISOString(), startDate.toISOString(), sender);

    return reply(`✅ Subscription renewed! ${plan.name} active until ${endDate.toISOString()}.`);
  }
}

module.exports = Subscriptions;
