class FeedbackFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'feedback';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.feedback !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!feedback ')) {
      const content = text.slice('!feedback '.length).trim();

      if (content === 'stats') {
        if (!isOwner) {
          await reply('Only admins can view feedback stats.');
          return true;
        }
        return this.showStats(reply);
      }

      return this.recordFeedback(content, sender, reply);
    }

    if (lower === '!feedback') {
      await reply('Usage: !feedback [rating] [optional comment] (rating 1-5)\nExample: !feedback 5 Great service!\n\nOr !feedback stats for admin stats.');
      return true;
    }

    if (lower === '!survey') {
      return this.sendSurvey(sender, reply);
    }

    return false;
  }

  async recordFeedback(input, sender, reply) {
    const parts = input.split(/\s+/);
    const rating = parseInt(parts[0]);

    if (isNaN(rating) || rating < 1 || rating > 5) {
      await reply('Please provide a rating between 1 and 5.\nUsage: !feedback [rating] [optional comment]');
      return true;
    }

    const comment = parts.slice(1).join(' ').trim() || '';

    try {
      await this.db.run(
        'INSERT INTO feedback (user_jid, rating, comment, created_at) VALUES (?, ?, ?, datetime("now"))',
        [sender, rating, comment]
      );

      let response = `Thank you for your ${rating}/5 rating!`;
      if (rating <= 2) {
        response += ' We\'re sorry to hear you had a poor experience. A team member will follow up with you.';
      } else if (rating >= 4) {
        response += ' We\'re glad you\'re satisfied!';
      }
      await reply(response);
    } catch (err) {
      await reply('Failed to record feedback. Please try again.');
    }
    return true;
  }

  async sendSurvey(sender, reply) {
    try {
      const { createButtonMessage } = require('../utils/buttons');
      const buttons = createButtonMessage(
        '📊 *Quick Survey*',
        'How would you rate your experience with us?',
        [
          { text: '⭐ 1', id: 'feedback 1' },
          { text: '⭐⭐ 2', id: 'feedback 2' },
          { text: '⭐⭐⭐ 3', id: 'feedback 3' },
          { text: '⭐⭐⭐⭐ 4', id: 'feedback 4' },
          { text: '⭐⭐⭐⭐⭐ 5', id: 'feedback 5' },
        ]
      );
      await this.sock.sendMessage(sender, buttons);
    } catch {
      await reply('📊 *Quick Survey*\n\nHow would you rate your experience?\n\nReply:\n!feedback 1 - Poor\n!feedback 2 - Below Average\n!feedback 3 - Average\n!feedback 4 - Good\n!feedback 5 - Excellent');
    }
    return true;
  }

  async showStats(reply) {
    try {
      const stats = await this.db.get(
        'SELECT COUNT(*) as total, AVG(rating) as avg, MIN(rating) as min, MAX(rating) as max FROM feedback'
      );
      const distribution = await this.db.all(
        'SELECT rating, COUNT(*) as count FROM feedback GROUP BY rating ORDER BY rating'
      );

      let msg = '*Feedback Statistics*\n\n';
      msg += `Total Responses: ${stats.total}\n`;
      msg += `Average Rating: ${stats.avg ? parseFloat(stats.avg).toFixed(2) : 'N/A'}\n`;
      msg += `Range: ${stats.min || 'N/A'} - ${stats.max || 'N/A'}\n\n`;
      msg += '*Distribution:*\n';
      for (const row of distribution) {
        const bar = '█'.repeat(row.count);
        msg += `${row.rating}: ${bar} (${row.count})\n`;
      }
      await reply(msg.trim());
    } catch (err) {
      await reply('Failed to retrieve feedback statistics.');
    }
  }
}

module.exports = FeedbackFeature;
