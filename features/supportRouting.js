class SupportRoutingFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'supportRouting';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.supportRouting !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!support ')) {
      const content = text.slice('!support '.length).trim();
      if (content.startsWith('status ')) {
        return this.checkTicketStatus(content.slice('status '.length).trim(), sender, reply);
      }
      if (content.startsWith('close ')) {
        return this.closeTicket(content.slice('close '.length).trim(), sender, isOwner, reply);
      }
      return this.openTicket(content, sender, reply);
    }

    if (lower === '!support') {
      await reply('Usage:\n!support [issue description] - Open ticket\n!support status [id] - Check status\n!support close [id] - Close ticket');
      return true;
    }

    if (lower.startsWith('!agent ')) {
      if (!isOwner && !this.config.supportRouting?.agents?.includes(sender)) {
        await reply('Only agents can reply to tickets.');
        return true;
      }
      const content = text.slice('!agent '.length).trim();
      const parts = content.split(/\s+/);
      const ticketId = parts[0];
      const replyText = parts.slice(1).join(' ');
      return this.agentReply(ticketId, replyText, sender, reply);
    }

    return false;
  }

  async openTicket(issue, sender, reply) {
    if (!issue) {
      await reply('Please describe your issue. Usage: !support [issue description]');
      return true;
    }

    try {
      const sentiment = await this.analyzeSentiment(issue);
      const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;
      const autoEscalate = sentiment === 'negative' || sentiment === 'angry';

      await this.db.run(
        'INSERT INTO support_tickets (id, user_jid, issue, status, sentiment, escalated, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now"))',
        [ticketId, sender, issue, autoEscalate ? 'escalated' : 'open', sentiment, autoEscalate ? 1 : 0]
      );

      let response = `Ticket created: ${ticketId}\nIssue: ${issue}\nStatus: ${autoEscalate ? 'Escalated to human agent' : 'Open'}\n\n`;
      if (autoEscalate) {
        response += 'Your issue has been escalated to a human agent due to the nature of your message. A team member will reach out shortly.';
        await this.notifyAgents(ticketId, sender, issue);
      } else {
        response += 'A support agent will review your ticket and respond. Use !support status ' + ticketId + ' to check for updates.';
      }
      await reply(response);

      if (this.config.crm?.webhookUrl) {
        this.postToCrm({ type: 'ticket', ticketId, sender, issue, sentiment, escalated: autoEscalate }).catch(() => {});
      }
    } catch (err) {
      await reply('Failed to create support ticket. Please try again.');
    }
    return true;
  }

  async checkTicketStatus(ticketId, sender, reply) {
    if (!ticketId) {
      await reply('Usage: !support status [ticketId]');
      return true;
    }
    try {
      const ticket = await this.db.get('SELECT * FROM support_tickets WHERE id = ?', [ticketId.toUpperCase()]);
      if (!ticket) {
        await reply('Ticket not found.');
        return true;
      }
      if (ticket.user_jid !== sender && !this.config.supportRouting?.agents?.includes(sender)) {
        await reply('You can only check your own tickets.');
        return true;
      }
      const msg = `*Ticket: ${ticket.id}*\nIssue: ${ticket.issue}\nStatus: ${ticket.status}\nSentiment: ${ticket.sentiment}\nCreated: ${ticket.created_at}\nAgent Replies: ${ticket.agent_replies || 'None'}`;
      await reply(msg);
    } catch (err) {
      await reply('Failed to check ticket status.');
    }
    return true;
  }

  async closeTicket(ticketId, sender, isOwner, reply) {
    if (!ticketId) {
      await reply('Usage: !support close [ticketId]');
      return true;
    }
    try {
      const ticket = await this.db.get('SELECT * FROM support_tickets WHERE id = ?', [ticketId.toUpperCase()]);
      if (!ticket) {
        await reply('Ticket not found.');
        return true;
      }
      if (ticket.user_jid !== sender && !isOwner) {
        await reply('You can only close your own tickets.');
        return true;
      }
      await this.db.run('UPDATE support_tickets SET status = "closed" WHERE id = ?', [ticketId.toUpperCase()]);
      await reply(`Ticket ${ticketId} has been closed.`);
    } catch (err) {
      await reply('Failed to close ticket.');
    }
    return true;
  }

  async agentReply(ticketId, replyText, agentJid, reply) {
    if (!ticketId || !replyText) {
      await reply('Usage: !agent [ticketId] [reply]');
      return true;
    }
    try {
      const ticket = await this.db.get('SELECT * FROM support_tickets WHERE id = ?', [ticketId.toUpperCase()]);
      if (!ticket) {
        await reply('Ticket not found.');
        return true;
      }
      const existingReplies = ticket.agent_replies ? JSON.parse(ticket.agent_replies) : [];
      existingReplies.push({ agent: agentJid, message: replyText, timestamp: new Date().toISOString() });

      await this.db.run(
        'UPDATE support_tickets SET status = "replied", agent_replies = ?, updated_at = datetime("now") WHERE id = ?',
        [JSON.stringify(existingReplies), ticketId.toUpperCase()]
      );

      try {
        await this.sock.sendMessage(ticket.user_jid, {
          text: `*Agent Reply on Ticket ${ticketId}*:\n\n${replyText}\n\nReply to this or use !support for more help.`
        });
      } catch {}

      await reply(`Reply sent to user on ticket ${ticketId}.`);
    } catch (err) {
      await reply('Failed to send agent reply.');
    }
    return true;
  }

  async analyzeSentiment(text) {
    try {
      const result = await this.aiRouter.ask(
        `Analyze the sentiment of this customer support message. Reply with EXACTLY ONE word: positive, neutral, negative, or angry.\n\nMessage: "${text}"`,
        { systemPrompt: 'You are a sentiment analysis tool. Only output one word.' }
      );
      const cleaned = result.toLowerCase().trim();
      if (['positive', 'neutral', 'negative', 'angry'].includes(cleaned)) {
        return cleaned;
      }
    } catch {}
    return 'neutral';
  }

  async notifyAgents(ticketId, senderJid, issue) {
    const agents = this.config.supportRouting?.agents || [];
    for (const agent of agents) {
      try {
        await this.sock.sendMessage(agent, {
          text: `*Escalated Ticket: ${ticketId}*\nFrom: ${senderJid}\nIssue: ${issue}\n\nUse !agent ${ticketId} [reply] to respond.`
        });
      } catch {}
    }
  }

  async postToCrm(data) {
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

module.exports = SupportRoutingFeature;
