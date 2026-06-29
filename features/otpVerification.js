const crypto = require('crypto');

class OtpVerificationFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'otpVerification';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.otpVerification !== false;
    this.otpExpiryMinutes = config.otpVerification?.expiryMinutes || 5;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!otp request ')) {
      return this.requestOtp(text.slice('!otp request '.length).trim(), sender, reply);
    }

    if (lower.startsWith('!otp verify ')) {
      return this.verifyOtp(text.slice('!otp verify '.length).trim(), sender, reply);
    }

    if (lower === '!otp status') {
      return this.checkOtpStatus(sender, reply);
    }

    if (lower.startsWith('!otp')) {
      await reply('Commands:\n!otp request [purpose] - Get OTP\n!otp verify [code] [purpose] - Verify OTP\n!otp status - Check verification status');
      return true;
    }

    return false;
  }

  async requestOtp(purpose, sender, reply) {
    if (!purpose) {
      await reply('Usage: !otp request [purpose]\nExample: !otp request login');
      return true;
    }

    try {
      const existing = await this.db.get(
        'SELECT * FROM otp_codes WHERE jid = ? AND purpose = ? AND verified = 0 AND expires_at > datetime("now")',
        [sender, purpose]
      );
      if (existing) {
        const expiresIn = this.getRemainingSeconds(existing.expires_at);
        await reply(`An OTP was already sent. It expires in ${Math.ceil(expiresIn / 60)} minutes. Please check your messages.`);
        return true;
      }

      const otp = this.generateOtp();
      const hash = this.hashOtp(otp);
      const expiresAt = new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000).toISOString();

      await this.db.run(
        'INSERT INTO otp_codes (jid, purpose, code_hash, expires_at, verified, created_at) VALUES (?, ?, ?, ?, 0, datetime("now"))',
        [sender, purpose, hash, expiresAt]
      );

      await reply(`Your OTP for ${purpose} is: ${otp}\n\nThis code expires in ${this.otpExpiryMinutes} minutes. Do not share this code.`);

      if (this.config.otpVerification?.logOtp) {
        try {
          await this.sock.sendMessage(this.config.ownerJid, {
            text: `OTP sent:\nUser: ${sender}\nPurpose: ${purpose}\nCode: ${otp}`
          });
        } catch {}
      }
    } catch (err) {
      await reply('Failed to generate OTP. Please try again.');
    }
    return true;
  }

  async verifyOtp(input, sender, reply) {
    const parts = input.split(/\s+/);
    if (parts.length < 2) {
      await reply('Usage: !otp verify [code] [purpose]\nExample: !otp verify 123456 login');
      return true;
    }
    const [code, ...purposeParts] = parts;
    const purpose = purposeParts.join(' ');

    try {
      const records = await this.db.all(
        'SELECT * FROM otp_codes WHERE jid = ? AND purpose = ? AND verified = 0 AND expires_at > datetime("now") ORDER BY created_at DESC LIMIT 5',
        [sender, purpose]
      );

      if (!records || records.length === 0) {
        await reply('No valid OTP found. Please request a new one using !otp request [purpose].');
        return true;
      }

      for (const record of records) {
        if (this.verifyHash(code, record.code_hash)) {
          await this.db.run(
            'UPDATE otp_codes SET verified = 1, verified_at = datetime("now") WHERE id = ?',
            [record.id]
          );
          await reply('OTP verified successfully!');
          return true;
        }
      }

      await reply('Invalid OTP code. Please try again or request a new one.');
    } catch (err) {
      await reply('Failed to verify OTP.');
    }
    return true;
  }

  async checkOtpStatus(sender, reply) {
    try {
      const verified = await this.db.all(
        'SELECT DISTINCT purpose FROM otp_codes WHERE jid = ? AND verified = 1',
        [sender]
      );
      if (!verified || verified.length === 0) {
        await reply('You have no verified OTPs.');
        return true;
      }
      const purposes = verified.map(v => v.purpose).join(', ');
      await reply(`Verified for: ${purposes}`);
    } catch (err) {
      await reply('Failed to check OTP status.');
    }
    return true;
  }

  generateOtp() {
    return crypto.randomInt(100000, 999999).toString();
  }

  hashOtp(otp) {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  verifyHash(otp, hash) {
    return this.hashOtp(otp) === hash;
  }

  getRemainingSeconds(expiresAt) {
    const exp = new Date(expiresAt);
    return Math.max(0, (exp.getTime() - Date.now()) / 1000);
  }
}

module.exports = OtpVerificationFeature;
