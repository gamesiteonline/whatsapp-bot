const crypto = require('crypto');

class PaymentGateway {
  constructor(config) {
    this.config = config || {};
  }

  async createPaymentLink(amount, currency, description, metadata) {
    const paymentId = `pi_${crypto.randomBytes(16).toString('hex')}`;
    const mockUrl = `https://mock.stripe.com/pay/${paymentId}`;

    return {
      id: paymentId,
      url: mockUrl,
      amount,
      currency: currency || 'usd',
      description: description || '',
      metadata: metadata || {},
      status: 'pending',
      created_at: new Date().toISOString(),
    };
  }

  async checkStatus(paymentId) {
    const statuses = ['pending', 'completed', 'failed'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    return {
      id: paymentId,
      status: randomStatus,
      checked_at: new Date().toISOString(),
    };
  }
}

module.exports = PaymentGateway;
