class CartRemindersFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'cartReminders';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.cartReminders !== false;
    this.abandonmentHours = config.cartReminders?.abandonmentHours || 1;
    this._initCron();
  }

  _initCron() {
    try {
      const cron = require('node-cron');
      cron.schedule('*/15 * * * *', () => {
        this.checkAbandonedCarts().catch(() => {});
      });
    } catch {}
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!cart add ')) {
      return this.addToCart(text.slice('!cart add '.length).trim(), sender, reply);
    }

    if (lower.startsWith('!cart remove ')) {
      return this.removeFromCart(text.slice('!cart remove '.length).trim(), sender, reply);
    }

    if (lower === '!cart view') {
      return this.viewCart(sender, reply);
    }

    if (lower === '!cart checkout') {
      return this.checkoutCart(sender, reply);
    }

    if (lower.startsWith('!cart reminder ')) {
      if (!isOwner) {
        await reply('Only admins can set cart reminder schedules.');
        return true;
      }
      return this.scheduleReminder(text.slice('!cart reminder '.length).trim(), sender, reply);
    }

    if (lower === '!cart') {
      await reply('Commands: !cart add [item] [qty], !cart remove [item], !cart view, !cart checkout');
      return true;
    }

    return false;
  }

  async addToCart(input, sender, reply) {
    const parts = input.split(/\s+/);
    const qty = parts.length > 1 ? parseInt(parts[parts.length - 1]) : 1;
    const item = parts.length > 1 ? parts.slice(0, -1).join(' ') : input;

    if (!item) {
      await reply('Usage: !cart add [item] [qty]');
      return true;
    }

    try {
      const existing = await this.db.get(
        'SELECT * FROM carts WHERE user_jid = ? AND item = ? AND status = "active"',
        [sender, item]
      );

      if (existing) {
        await this.db.run(
          'UPDATE carts SET quantity = quantity + ?, updated_at = datetime("now") WHERE id = ?',
          [isNaN(qty) ? 1 : qty, existing.id]
        );
      } else {
        await this.db.run(
          'INSERT INTO carts (user_jid, item, quantity, status, created_at, updated_at) VALUES (?, ?, ?, "active", datetime("now"), datetime("now"))',
          [sender, item, isNaN(qty) ? 1 : qty]
        );
      }

      await reply(`Added ${isNaN(qty) ? 1 : qty}x ${item} to your cart.`);
    } catch (err) {
      await reply('Failed to add item to cart.');
    }
    return true;
  }

  async removeFromCart(input, sender, reply) {
    if (!input) {
      await reply('Usage: !cart remove [item]');
      return true;
    }
    try {
      const result = await this.db.run(
        'DELETE FROM carts WHERE user_jid = ? AND item = ? AND status = "active"',
        [sender, input]
      );
      if (result.changes > 0) {
        await reply(`Removed ${input} from your cart.`);
      } else {
        await reply(`${input} not found in your cart.`);
      }
    } catch (err) {
      await reply('Failed to remove item from cart.');
    }
    return true;
  }

  async viewCart(sender, reply) {
    try {
      const items = await this.db.all(
        'SELECT * FROM carts WHERE user_jid = ? AND status = "active"',
        [sender]
      );
      if (!items || items.length === 0) {
        await reply('Your cart is empty. Use !cart add [item] [qty] to add items.');
        return true;
      }
      let msg = '*Your Cart:*\n\n';
      let total = 0;
      for (const item of items) {
        msg += `${item.quantity}x ${item.item}\n`;
        total += item.quantity;
      }
      msg += `\nTotal items: ${total}\n\nUse !cart checkout to complete your order.`;
      await reply(msg);
    } catch (err) {
      await reply('Failed to retrieve cart.');
    }
    return true;
  }

  async checkoutCart(sender, reply) {
    try {
      const items = await this.db.all(
        'SELECT * FROM carts WHERE user_jid = ? AND status = "active"',
        [sender]
      );
      if (!items || items.length === 0) {
        await reply('Your cart is empty. Nothing to checkout.');
        return true;
      }

      let msg = '*Checkout Complete!*\n\n';
      for (const item of items) {
        msg += `${item.quantity}x ${item.item}\n`;
      }
      msg += '\nThank you for your order!';
      await reply(msg);

      await this.db.run(
        'UPDATE carts SET status = "checked_out", checked_out_at = datetime("now") WHERE user_jid = ? AND status = "active"',
        [sender]
      );
    } catch (err) {
      await reply('Failed to complete checkout.');
    }
    return true;
  }

  async scheduleReminder(input, sender, reply) {
    try {
      const cron = require('node-cron');
      const parts = input.split(/\s+/);
      if (parts.length < 5) {
        await reply('Usage: !cart reminder [cron expression]\nExample: !cart reminder 0 */2 * * * (every 2 hours)');
        return true;
      }
      const cronExpr = parts.slice(0, 5).join(' ');
      if (!cron.validate(cronExpr)) {
        await reply('Invalid cron expression. Format: minute hour day month dayOfWeek');
        return true;
      }
      const scheduleId = `CRM-${Date.now().toString(36).toUpperCase()}`;
      await this.db.run(
        'INSERT INTO cron_schedules (id, jid, cron_expr, action, payload, created_at, active) VALUES (?, ?, ?, ?, ?, datetime("now"), 1)',
        [scheduleId, 'system', cronExpr, 'cart_reminder', JSON.stringify({})]
      );

      cron.schedule(cronExpr, () => {
        this.checkAbandonedCarts().catch(() => {});
      });

      await reply(`Cart reminder schedule created (ID: ${scheduleId}).`);
    } catch (err) {
      await reply('Failed to create reminder schedule.');
    }
    return true;
  }

  async checkAbandonedCarts() {
    try {
      const cutoff = new Date(Date.now() - this.abandonmentHours * 60 * 60 * 1000).toISOString();
      const users = await this.db.all(
        'SELECT DISTINCT user_jid FROM carts WHERE status = "active" AND updated_at < ?',
        [cutoff]
      );

      for (const user of users) {
        const alreadyNotified = await this.db.get(
          'SELECT * FROM cart_reminders WHERE user_jid = ? AND reminded_at > ?',
          [user.user_jid, cutoff]
        );
        if (alreadyNotified) continue;

        const items = await this.db.all(
          'SELECT * FROM carts WHERE user_jid = ? AND status = "active"',
          [user.user_jid]
        );
        if (!items || items.length === 0) continue;

        let msg = '*🛒 Your cart is waiting!*\n\nYou left these items in your cart:\n\n';
        for (const item of items) {
          msg += `${item.quantity}x ${item.item}\n`;
        }
        msg += '\nUse !cart view to see your cart, or !cart checkout to complete your order!';

        try {
          await this.sock.sendMessage(user.user_jid, { text: msg });
          await this.db.run(
            'INSERT INTO cart_reminders (user_jid, reminded_at) VALUES (?, datetime("now"))',
            [user.user_jid]
          );
        } catch {}
      }
    } catch (err) {
      console.error('Cart reminder check failed:', err);
    }
  }
}

module.exports = CartRemindersFeature;
