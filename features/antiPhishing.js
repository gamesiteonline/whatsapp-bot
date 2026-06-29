class AntiPhishing {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'antiPhishing';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;

    this.suspiciousTLDs = [
      '.xyz', '.top', '.club', '.gq', '.ml', '.tk', '.cf', '.ga',
      '.stream', '.click', '.download', '.work', '.review', '.date', '.men', '.loan'
    ];

    this.suspiciousDomains = [
      'bit.ly', 'tinyurl.com', 'goo.gl', 'shorturl.at', 'cutt.ly', 'rb.gy',
      'is.gd', 'buff.ly', 'ow.ly', 'tiny.cc', 'bl.ink', 'short.cm', 'short.fyi'
    ];

    this.phishingKeywords = [
      'verify your account', 'login here', 'confirm your password',
      'update your payment', 'account suspended', 'security alert',
      'unusual activity', 'click here to verify', 'reset your password',
      'your account has been compromised', 'claim your prize', 'you have won',
      'free gift', 'congratulations you won', 'bank transfer',
      'urgent action required', 'your account will be closed',
      'verify your identity', 'confirm your details', 'update your billing'
    ];

    this.scamPatterns = [
      /\b(win|won|winner|prize|lottery)\s.*\b(money|cash|free|click|claim)\b/i,
      /\b(urgent|immediate|action required|account suspended|security breach)\b/i,
      /\b(verify|confirm|update)\s.*\b(account|password|payment|billing|credit)\b/i,
      /\b(bank|paypal|amazon|netflix|google|apple|microsoft)\s.*\b(verify|confirm|login|update)\b/i,
    ];
  }

  get enabled() {
    return this.config.features?.antiPhishing !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!scan')) {
      const url = text.slice(5).trim();
      if (!url) {
        await reply('❌ Provide a URL to scan.\nUsage: !scan <url>');
        return true;
      }
      const result = this._analyzeUrl(url);
      if (result.isSuspicious) {
        await reply(`⚠️ *Suspicious URL Detected*\n\nURL: ${url}\nReasons: ${result.reasons.join(', ')}\n\nAvoid visiting this link.`);
      } else {
        await reply(`✅ URL appears safe:\n${url}`);
      }
      return true;
    }

    if (isOwner) return false;

    const urls = this._extractUrls(text);
    const reasons = [];

    for (const url of urls) {
      const result = this._analyzeUrl(url);
      if (result.isSuspicious) reasons.push(...result.reasons);
    }

    for (const keyword of this.phishingKeywords) {
      if (lower.includes(keyword)) {
        reasons.push(`Phishing keyword: "${keyword}"`);
        break;
      }
    }

    for (const pattern of this.scamPatterns) {
      if (pattern.test(text)) {
        reasons.push('Suspicious message pattern detected');
        break;
      }
    }

    if (reasons.length > 0) {
      const warnMsg = `⚠️ *Phishing Alert*\n\nThis message appears to be a phishing attempt.\nReasons: ${reasons.join(', ')}\n\nPlease do not click any links or provide personal information.`;

      if (isGroup) {
        await this.sock.sendMessage(msg.key.remoteJid, {
          text: `⚠️ @${sender.split('@')[0]} sent a suspicious message.\n${reasons.map(r => `• ${r}`).join('\n')}`,
          mentions: [sender]
        });
      } else {
        await reply(warnMsg);
      }
      return true;
    }

    return false;
  }

  _extractUrls(text) {
    const matches = text.match(/https?:\/\/[^\s]+/gi);
    return matches || [];
  }

  _analyzeUrl(url) {
    const result = { isSuspicious: false, reasons: [] };
    const lower = url.toLowerCase();

    for (const domain of this.suspiciousDomains) {
      if (lower.includes(domain)) {
        result.isSuspicious = true;
        result.reasons.push(`URL shortener: ${domain}`);
        break;
      }
    }

    if (!result.isSuspicious) {
      for (const tld of this.suspiciousTLDs) {
        if (lower.includes(tld)) {
          result.isSuspicious = true;
          result.reasons.push(`Suspicious TLD: ${tld}`);
          break;
        }
      }
    }

    if (/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)) {
      result.isSuspicious = true;
      result.reasons.push('URL uses raw IP address');
    }

    const suspiciousUrlKeywords = ['login', 'verify', 'secure', 'account', 'update', 'confirm', 'bank', 'paypal', 'password'];
    for (const kw of suspiciousUrlKeywords) {
      if (lower.includes(kw)) {
        result.isSuspicious = true;
        result.reasons.push(`Suspicious keyword in URL: "${kw}"`);
        break;
      }
    }

    if (/https?:\/\/[^@]+@/.test(url)) {
      result.isSuspicious = true;
      result.reasons.push('URL contains @ symbol (deceptive)');
    }

    const hostname = url.replace(/https?:\/\//, '').split('/')[0];
    const subdomainCount = hostname.split('.').length;
    if (subdomainCount > 4) {
      result.isSuspicious = true;
      result.reasons.push('Excessive subdomains');
    }

    return result;
  }
}

module.exports = AntiPhishing;
