class ContentDeliveryFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'contentDelivery';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.contentDelivery !== false;
    this.topics = ['tips', 'news', 'motivational', 'weather', 'crypto'];
    this._initScheduledContent();
  }

  _initScheduledContent() {
    try {
      const cron = require('node-cron');

      cron.schedule('0 8 * * *', () => this.pushContent('tips').catch(() => {}));
      cron.schedule('0 12 * * *', () => this.pushContent('news').catch(() => {}));
      cron.schedule('0 7 * * *', () => this.pushContent('motivational').catch(() => {}));
      cron.schedule('0 6 * * *', () => this.pushContent('weather').catch(() => {}));
      cron.schedule('0 10 * * *', () => this.pushContent('crypto').catch(() => {}));

      this._loadCustomSchedules(cron);
    } catch {}
  }

  async _loadCustomSchedules(cron) {
    try {
      const schedules = await this.db.all(
        'SELECT * FROM cron_schedules WHERE action = "content_delivery" AND active = 1'
      );
      for (const s of schedules) {
        const payload = JSON.parse(s.payload || '{}');
        if (cron.validate(s.cron_expr)) {
          cron.schedule(s.cron_expr, () => {
            this.pushContent(payload.topic).catch(() => {});
          });
        }
      }
    } catch {}
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!subscribe ')) {
      return this.subscribe(text.slice('!subscribe '.length).trim(), sender, reply);
    }

    if (lower.startsWith('!unsubscribe ')) {
      return this.unsubscribe(text.slice('!unsubscribe '.length).trim(), sender, reply);
    }

    if (lower.startsWith('!content ')) {
      return this.getContentNow(text.slice('!content '.length).trim(), sender, reply);
    }

    if (lower.startsWith('!content schedule ')) {
      if (!isOwner) {
        await reply('Only admins can schedule content.');
        return true;
      }
      return this.scheduleContent(text.slice('!content schedule '.length).trim(), sender, reply);
    }

    if (lower === '!content') {
      await reply(`Commands: !subscribe [topic], !unsubscribe [topic], !content [topic]\nTopics: ${this.topics.join(', ')}`);
      return true;
    }

    return false;
  }

  async subscribe(topic, sender, reply) {
    if (!this.topics.includes(topic)) {
      await reply(`Unknown topic. Available: ${this.topics.join(', ')}`);
      return true;
    }
    try {
      const existing = await this.db.get(
        'SELECT * FROM content_subscriptions WHERE user_jid = ? AND topic = ?',
        [sender, topic]
      );
      if (existing) {
        await reply(`You are already subscribed to ${topic}.`);
        return true;
      }
      await this.db.run(
        'INSERT INTO content_subscriptions (user_jid, topic, created_at) VALUES (?, ?, datetime("now"))',
        [sender, topic]
      );
      await reply(`Subscribed to ${topic}! You'll receive daily ${topic} content.`);
    } catch (err) {
      await reply('Failed to subscribe.');
    }
    return true;
  }

  async unsubscribe(topic, sender, reply) {
    if (!this.topics.includes(topic)) {
      await reply(`Unknown topic. Available: ${this.topics.join(', ')}`);
      return true;
    }
    try {
      await this.db.run(
        'DELETE FROM content_subscriptions WHERE user_jid = ? AND topic = ?',
        [sender, topic]
      );
      await reply(`Unsubscribed from ${topic}.`);
    } catch (err) {
      await reply('Failed to unsubscribe.');
    }
    return true;
  }

  async getContentNow(topic, sender, reply) {
    if (!this.topics.includes(topic)) {
      await reply(`Unknown topic. Available: ${this.topics.join(', ')}`);
      return true;
    }
    try {
      const content = await this.generateContent(topic);
      await reply(`*${topic.charAt(0).toUpperCase() + topic.slice(1)}*\n\n${content}`);
    } catch (err) {
      await reply(`Failed to generate ${topic} content.`);
    }
    return true;
  }

  async scheduleContent(input, sender, reply) {
    try {
      const cron = require('node-cron');
      const parts = input.split(/\s+/);
      const topic = parts[0];
      const cronExpr = parts.slice(1).join(' ');

      if (!this.topics.includes(topic)) {
        await reply(`Unknown topic. Available: ${this.topics.join(', ')}`);
        return true;
      }
      if (!cron.validate(cronExpr)) {
        await reply('Invalid cron expression. Format: minute hour day month dayOfWeek');
        return true;
      }

      const scheduleId = `SCH-${Date.now().toString(36).toUpperCase()}`;
      await this.db.run(
        'INSERT INTO cron_schedules (id, jid, cron_expr, action, payload, created_at, active) VALUES (?, ?, ?, ?, ?, datetime("now"), 1)',
        [scheduleId, 'system', cronExpr, 'content_delivery', JSON.stringify({ topic })]
      );

      cron.schedule(cronExpr, () => {
        this.pushContent(topic).catch(() => {});
      });

      await reply(`Content scheduled: ${topic} at "${cronExpr}" (ID: ${scheduleId})`);
    } catch (err) {
      await reply('Failed to schedule content.');
    }
    return true;
  }

  async pushContent(topic) {
    try {
      const subscribers = await this.db.all(
        'SELECT user_jid FROM content_subscriptions WHERE topic = ?',
        [topic]
      );
      if (!subscribers || subscribers.length === 0) return;

      const content = await this.generateContent(topic);
      for (const sub of subscribers) {
        try {
          await this.sock.sendMessage(sub.user_jid, {
            text: `*${topic.charAt(0).toUpperCase() + topic.slice(1)} Update*\n\n${content}`
          });
        } catch {}
      }
    } catch (err) {
      console.error(`Failed to push ${topic} content:`, err);
    }
  }

  async generateContent(topic) {
    try {
      return await this.aiRouter.ask(
        `Generate a ${topic} update for today. Keep it concise (2-3 paragraphs).`,
        {
          systemPrompt: `You are a ${topic} content curator. Provide timely, accurate, and engaging ${topic} content.`,
          temperature: 0.7
        }
      );
    } catch {
      const fallbacks = {
        tips: '💡 Tip: Take short breaks every 25 minutes to maintain productivity throughout the day.',
        news: '📰 Stay tuned for the latest updates. Check back later for more news.',
        motivational: '✨ "The only way to do great work is to love what you do." - Steve Jobs',
        weather: '🌤️ Remember to check your local weather forecast before heading out.',
        crypto: '📊 Crypto markets are open 24/7. Always do your own research before investing.',
      };
      return fallbacks[topic] || 'Content momentarily unavailable. Please check back later.';
    }
  }
}

module.exports = ContentDeliveryFeature;
