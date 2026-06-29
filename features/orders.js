class OrdersFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'orders';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.orders !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!order set ')) {
      if (!isOwner) {
        await reply('Only admins can update orders.');
        return true;
      }
      const content = text.slice('!order set '.length).trim();
      const parts = content.split('|').map(s => s.trim());
      if (parts.length < 2) {
        await reply('Usage: !order set [orderId]|[status]|[details]');
        return true;
      }
      const [orderId, status, ...detailsParts] = parts;
      const details = detailsParts.join('|') || 'No details';
      try {
        const existing = await this.db.get('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (existing) {
          await this.db.run(
            'UPDATE orders SET status = ?, details = ?, updated_at = datetime("now") WHERE order_id = ?',
            [status, details, orderId]
          );
        } else {
          await this.db.run(
            'INSERT INTO orders (order_id, status, details, user_jid, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))',
            [orderId, status, details, sender]
          );
        }
        await reply(`Order ${orderId} updated to: ${status}`);
      } catch (err) {
        await reply('Failed to update order.');
      }
      return true;
    }

    if (lower.startsWith('!order create ')) {
      if (!isOwner) {
        await reply('Only admins can create mock orders.');
        return true;
      }
      const content = text.slice('!order create '.length).trim();
      const parts = content.split('|').map(s => s.trim());
      if (parts.length < 2) {
        await reply('Usage: !order create [customer]|[item]|[status]');
        return true;
      }
      const [customer, item, status] = parts;
      const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      try {
        await this.db.run(
          'INSERT INTO orders (order_id, status, details, user_jid, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))',
          [orderId, status || 'pending', `Customer: ${customer}, Item: ${item}`, sender]
        );
        await reply(`Mock order created: ${orderId}`);
      } catch (err) {
        await reply('Failed to create mock order.');
      }
      return true;
    }

    const orderMatch = text.match(/\b(ORD-[A-Z0-9-]+)\b/i);
    if (orderMatch) {
      const orderId = orderMatch[1].toUpperCase();
      try {
        const order = await this.db.get('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (order) {
          const msg = `*Order:* ${order.order_id}\n*Status:* ${order.status}\n*Details:* ${order.details}\n*Created:* ${order.created_at}\n*Updated:* ${order.updated_at || 'N/A'}`;
          await reply(msg);
        } else {
          await reply(`Order ${orderId} not found.`);
        }
      } catch (err) {
        await reply('Error looking up order.');
      }
      return true;
    }

    if (lower.startsWith('!order ')) {
      await reply('Usage: !order set [orderId]|[status]|[details] or provide an order ID like ORD-12345');
      return true;
    }

    return false;
  }
}

module.exports = OrdersFeature;
