class LeadsFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'leads';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.leads !== false;
    this.steps = ['name', 'email', 'phone', 'interest', 'confirm'];
    this.stepPrompts = {
      name: 'Great! Let\'s get started. What is your full name?',
      email: 'Thanks! What is your email address?',
      phone: 'And your phone number?',
      interest: 'What product or service are you interested in?',
      confirm: 'Please confirm the following:\n\nName: {name}\nEmail: {email}\nPhone: {phone}\nInterest: {interest}\n\nReply "yes" to confirm or "no" to start over.'
    };
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!lead') || lower.startsWith('!start lead')) {
      return this.startLeadFlow(sender, reply);
    }

    if (lower === '!lead cancel') {
      this.contextMemory.delete(sender, 'leadFlow');
      await reply('Lead capture cancelled.');
      return true;
    }

    const session = this.contextMemory.get(sender, 'leadFlow');
    if (!session) return false;

    return this.processStep(session, sender, text.trim(), reply);
  }

  async startLeadFlow(sender, reply) {
    const session = {
      step: 0,
      data: {}
    };
    this.contextMemory.set(sender, 'leadFlow', session);
    await reply(this.stepPrompts.name);
    return true;
  }

  async processStep(session, sender, input, reply) {
    const stepIdx = session.step;

    if (stepIdx < this.steps.length - 1) {
      const field = this.steps[stepIdx];
      if (field === 'email' && !this.isValidEmail(input)) {
        await reply('Please enter a valid email address.');
        return true;
      }
      if (field === 'phone' && !this.isValidPhone(input)) {
        await reply('Please enter a valid phone number (digits only, with country code).');
        return true;
      }
      session.data[field] = input;
      session.step++;
      this.contextMemory.set(sender, 'leadFlow', session);

      const nextField = this.steps[session.step];
      if (nextField === 'confirm') {
        let prompt = this.stepPrompts.confirm;
        for (const [k, v] of Object.entries(session.data)) {
          prompt = prompt.replace(`{${k}}`, v);
        }
        await reply(prompt);
      } else {
        await reply(this.stepPrompts[nextField]);
      }
      return true;
    }

    if (stepIdx === 4) {
      const lower = input.toLowerCase();
      if (lower === 'yes' || lower === 'y') {
        return this.saveLead(sender, session.data, reply);
      } else if (lower === 'no' || lower === 'n') {
        this.contextMemory.delete(sender, 'leadFlow');
        await reply('No problem. Use !lead to start again when ready.');
        return true;
      } else {
        await reply('Please reply "yes" to confirm or "no" to cancel.');
        return true;
      }
    }

    return false;
  }

  async saveLead(sender, data, reply) {
    try {
      await this.db.run(
        'INSERT INTO leads (jid, name, email, phone, interest, source, created_at) VALUES (?, ?, ?, ?, ?, "whatsapp", datetime("now"))',
        [sender, data.name, data.email, data.phone, data.interest]
      );
      this.contextMemory.delete(sender, 'leadFlow');
      await reply('Thank you! Your information has been saved. A team member will contact you soon.');
      if (this.config.crm?.webhookUrl) {
        this.postToWebhook({ type: 'lead', jid: sender, ...data }).catch(() => {});
      }
    } catch (err) {
      await reply('Sorry, there was an error saving your information. Please try again.');
    }
    return true;
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  isValidPhone(phone) {
    return /^\+?[\d\s-]{7,15}$/.test(phone);
  }

  async postToWebhook(data) {
    if (!this.config.crm?.webhookUrl) return;
    try {
      const https = require('https');
      const body = JSON.stringify(data);
      const url = new URL(this.config.crm.webhookUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      };
      return new Promise((resolve, reject) => {
        const req = https.request(options, res => resolve(res.statusCode));
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    } catch {}
  }
}

module.exports = LeadsFeature;
