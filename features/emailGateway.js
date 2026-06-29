class EmailGateway {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'emailGateway';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.emailGateway !== false;
    this.smtpConfig = null;

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS email_config (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT PRIMARY KEY, smtp_host TEXT, smtp_user TEXT, smtp_pass TEXT, created_at TEXT)').run();
        this.db.prepare('CREATE TABLE IF NOT EXISTS email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, to_addr TEXT, subject TEXT, status TEXT, sent_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!email')) return false;

    const parts = text.slice(7).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'send':
        return this._sendEmail(text.slice(12).trim(), sender, reply);
      case 'inbox':
        return this._checkInbox(sender, reply);
      case 'config':
        return this._configureSMTP(text.slice(14).trim(), sender, reply);
      default:
        return reply('Commands: send, inbox, config');
    }
  }

  async _sendEmail(input, sender, reply) {
    const match = input.match(/^(\S+)\s+(.+?)\|(.+)$/s);
    if (!match) return reply('Usage: !email send [to] [subject]|[body]');

    const [, to, subject, body] = match;

    await reply(`📧 Sending email to ${to}...`);

    if (this.smtpConfig || this.db?.prepare('SELECT * FROM email_config WHERE user = ?').get(sender)) {
      try {
        const nodemailer = require('nodemailer');

        const config = this.smtpConfig || this.db.prepare('SELECT * FROM email_config WHERE user = ?').get(sender);
        const transporter = nodemailer.createTransport({
          host: config.smtp_host,
          port: 587,
          secure: false,
          auth: { user: config.smtp_user, pass: config.smtp_pass },
        });

        await transporter.sendMail({
          from: config.smtp_user,
          to: to.trim(),
          subject: subject.trim(),
          text: body.trim(),
        });

        if (this.db) {
          this.db.prepare('INSERT INTO email_log (user, to_addr, subject, status, sent_at) VALUES (?, ?, ?, "sent", ?)')
            .run(sender, to.trim(), subject.trim(), new Date().toISOString());
        }

        return reply(`✅ Email sent to ${to.trim()} successfully!`);
      } catch (err) {
        return reply(`Failed to send email: ${err.message}`);
      }
    }

    console.log(`[EmailGateway] MOCK send: to=${to.trim()}, subject=${subject.trim()}, body=${body.trim()}`);
    return reply(`✅ [MOCK] Email queued to ${to.trim()}\nSubject: ${subject.trim()}\n\nConfigure SMTP with !email config [host]|[user]|[pass] for live sending.`);
  }

  async _checkInbox(sender, reply) {
    const emails = this.db
      ? this.db.prepare('SELECT * FROM email_log WHERE user = ? ORDER BY sent_at DESC LIMIT 5').all(sender)
      : [];

    if (!emails.length) {
      return reply('📥 *Inbox (Mock)*\n\nNo recent emails. IMAP integration is a placeholder.\n\nTo connect IMAP, a future update will support full inbox reading.');
    }

    const lines = emails.map(e => `#${e.id} To: ${e.to_addr} - "${e.subject}" [${e.status}] (${e.sent_at})`);
    return reply(`*Recent Emails:*\n\n${lines.join('\n')}`);
  }

  async _configureSMTP(input, sender, reply) {
    const match = input.match(/^(.+?)\|(.+?)\|(.+)$/);
    if (!match) return reply('Usage: !email config [smtpHost]|[user]|[pass]');

    const [, host, user, pass] = match;
    this.smtpConfig = { smtp_host: host.trim(), smtp_user: user.trim(), smtp_pass: pass.trim() };

    if (this.db) {
      this.db.prepare('INSERT OR REPLACE INTO email_config (user, smtp_host, smtp_user, smtp_pass, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(sender, host.trim(), user.trim(), pass.trim(), new Date().toISOString());
    }

    return reply(`✅ SMTP configured: ${host.trim()}\nUser: ${user.trim()}\nYou can now send emails with !email send.`);
  }
}

module.exports = EmailGateway;
