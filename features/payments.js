class PaymentsFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'payments';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.payments !== false;
    this.paymentGateway = config.paymentGateway || { provider: 'mock', baseUrl: 'https://pay.example.com' };
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!pay ')) {
      const parts = text.slice('!pay '.length).trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();

      if (cmd === 'status') {
        return this.checkPaymentStatus(parts[1], sender, isOwner, reply);
      }

      if (cmd === 'history') {
        return this.getPaymentHistory(sender, reply);
      }

      const amount = parseFloat(cmd);
      if (!isNaN(amount) && parts.length >= 2) {
        const description = parts.slice(1).join(' ');
        return this.createPayment(amount, description, sender, reply);
      }

      await reply('Usage:\n!pay [amount] [description] - Create payment\n!pay status [id] - Check status\n!pay history - View history');
      return true;
    }

    return false;
  }

  async createPayment(amount, description, sender, reply) {
    if (amount <= 0) {
      await reply('Amount must be greater than 0.');
      return true;
    }
    try {
      const paymentId = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const paymentLink = this.generatePaymentLink(paymentId, amount, description);

      await this.db.run(
        'INSERT INTO payments (payment_id, user_jid, amount, description, status, link, created_at) VALUES (?, ?, ?, ?, "pending", ?, datetime("now"))',
        [paymentId, sender, amount, description, paymentLink]
      );

      const msg = `*Payment Request*\nAmount: ${this.formatCurrency(amount)}\nDescription: ${description}\nID: ${paymentId}\n\nPay here: ${paymentLink}`;
      await reply(msg);
    } catch (err) {
      await reply('Failed to create payment. Please try again.');
    }
    return true;
  }

  async checkPaymentStatus(paymentId, sender, isOwner, reply) {
    if (!paymentId) {
      await reply('Usage: !pay status [paymentId]');
      return true;
    }
    try {
      const payment = await this.db.get('SELECT * FROM payments WHERE payment_id = ?', [paymentId.toUpperCase()]);
      if (!payment) {
        await reply('Payment not found.');
        return true;
      }
      if (payment.user_jid !== sender && !isOwner) {
        await reply('You can only check your own payments.');
        return true;
      }
      const msg = `*Payment Status*\nID: ${payment.payment_id}\nAmount: ${this.formatCurrency(payment.amount)}\nDescription: ${payment.description}\nStatus: ${payment.status}\nLink: ${payment.link}\nCreated: ${payment.created_at}`;
      await reply(msg);
    } catch (err) {
      await reply('Failed to check payment status.');
    }
    return true;
  }

  async getPaymentHistory(sender, reply) {
    try {
      const payments = await this.db.all(
        'SELECT * FROM payments WHERE user_jid = ? ORDER BY created_at DESC LIMIT 20',
        [sender]
      );
      if (!payments || payments.length === 0) {
        await reply('No payment history found.');
        return true;
      }
      let msg = '*Payment History:*\n\n';
      for (const p of payments) {
        msg += `ID: ${p.payment_id}\nAmount: ${this.formatCurrency(p.amount)}\nStatus: ${p.status}\nDescription: ${p.description}\nCreated: ${p.created_at}\n\n`;
      }
      await reply(msg.trim());
    } catch (err) {
      await reply('Failed to retrieve payment history.');
    }
    return true;
  }

  generatePaymentLink(paymentId, amount, description) {
    if (this.paymentGateway.provider === 'mock') {
      return `${this.paymentGateway.baseUrl}/pay/${paymentId}?amount=${amount}&desc=${encodeURIComponent(description)}`;
    }
    return `${this.paymentGateway.baseUrl}/checkout/${paymentId}`;
  }

  formatCurrency(amount) {
    return `$${amount.toFixed(2)}`;
  }
}

module.exports = PaymentsFeature;
