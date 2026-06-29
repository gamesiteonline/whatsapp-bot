class MenusFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'menus';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.menus !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower === '!menu') {
      return this.showMainMenu(sender, isOwner, reply);
    }

    if (lower.startsWith('!help ')) {
      const category = lower.slice('!help '.length).trim();
      return this.showCategoryHelp(category, sender, isOwner, reply);
    }

    if (lower === '!help') {
      return this.showMainMenu(sender, isOwner, reply);
    }

    return false;
  }

  async showMainMenu(sender, isOwner, reply) {
    const categories = [
      { title: 'Orders', description: 'Track and manage your orders', command: '!help orders' },
      { title: 'Appointments', description: 'Book or manage appointments', command: '!help appointments' },
      { title: 'Payments', description: 'Make payments and view history', command: '!help payments' },
      { title: 'Support', description: 'Get help from support team', command: '!help support' },
      { title: 'FAQ', description: 'Frequently asked questions', command: '!help faq' },
      { title: 'Feedback', description: 'Share your feedback', command: '!help feedback' },
    ];

    if (isOwner) {
      categories.push(
        { title: 'Broadcast', description: 'Send broadcast messages', command: '!help broadcast' },
        { title: 'Leads', description: 'View and manage leads', command: '!help leads' },
        { title: 'CRM', description: 'CRM synchronization', command: '!help crm' }
      );
    }

    try {
      const { createListMessage } = require('../utils/buttons');
      const sections = [{
        title: 'Menu Categories',
        rows: categories.map(c => ({
          title: c.title,
          description: c.description,
          id: c.command
        }))
      }];

      const listMsg = createListMessage(
        '📋 *Main Menu*',
        'Select a category below to get started.',
        'Browse Categories',
        sections
      );

      await this.sock.sendMessage(sender, listMsg);
    } catch {
      let msg = '*Main Menu*\n\n';
      for (const c of categories) {
        msg += `*${c.title}* - ${c.description}\n\`${c.command}\`\n\n`;
      }
      msg += 'Select a category to see available commands.';
      await reply(msg.trim());
    }
    return true;
  }

  async showCategoryHelp(category, sender, isOwner, reply) {
    const helpMap = {
      orders: {
        title: 'Orders Help',
        commands: [
          { cmd: '!order set [id]|[status]|[details]', desc: 'Update/create order (admin)' },
          { cmd: 'ORD-12345', desc: 'Look up order by ID' },
        ]
      },
      appointments: {
        title: 'Appointments Help',
        commands: [
          { cmd: '!appointment book [date] [time] [service]', desc: 'Book appointment' },
          { cmd: '!appointment cancel [id]', desc: 'Cancel appointment' },
          { cmd: '!appointment reschedule [id] [date] [time]', desc: 'Reschedule appointment' },
          { cmd: '!appointment list', desc: 'List your appointments' },
          { cmd: '!appointment available [date]', desc: 'Check available slots' },
        ]
      },
      payments: {
        title: 'Payments Help',
        commands: [
          { cmd: '!pay [amount] [description]', desc: 'Create payment request' },
          { cmd: '!pay status [id]', desc: 'Check payment status' },
          { cmd: '!pay history', desc: 'View payment history' },
        ]
      },
      support: {
        title: 'Support Help',
        commands: [
          { cmd: '!support [issue description]', desc: 'Open a support ticket' },
          { cmd: '!support status [id]', desc: 'Check ticket status' },
          { cmd: '!support close [id]', desc: 'Close a ticket' },
        ]
      },
      faq: {
        title: 'FAQ Help',
        commands: [
          { cmd: '!faq [question]', desc: 'Ask a question' },
          { cmd: '!faq add [question]|[answer]', desc: 'Add FAQ entry (admin)' },
        ]
      },
      feedback: {
        title: 'Feedback Help',
        commands: [
          { cmd: '!feedback [rating] [comment]', desc: 'Submit feedback (1-5)' },
          { cmd: '!survey', desc: 'Take an interactive survey' },
          { cmd: '!feedback stats', desc: 'View feedback stats (admin)' },
        ]
      },
      broadcast: {
        title: 'Broadcast Help',
        commands: [
          { cmd: '!broadcast [message]', desc: 'Broadcast to all users (admin)' },
          { cmd: '!alert [jid] [message]', desc: 'Send direct alert (admin)' },
          { cmd: '!remind [jid] [time] [message]', desc: 'Schedule reminder (admin)' },
        ]
      },
      leads: {
        title: 'Leads Help',
        commands: [
          { cmd: '!lead', desc: 'Start lead capture flow' },
        ]
      },
      crm: {
        title: 'CRM Help',
        commands: [
          { cmd: '!crm export [type]', desc: 'Export data to CRM (admin)' },
          { cmd: '!crm webhook [url]', desc: 'Set CRM webhook (admin)' },
          { cmd: '!crm status', desc: 'Check CRM sync status (admin)' },
        ]
      }
    };

    const help = helpMap[category];
    if (!help) {
      await reply(`Unknown category: ${category}. Try: ${Object.keys(helpMap).join(', ')}`);
      return true;
    }

    try {
      const { createListMessage } = require('../utils/buttons');
      const sections = [{
        title: help.title,
        rows: help.commands.map(c => ({
          title: c.cmd,
          description: c.desc,
          id: c.cmd
        }))
      }];
      const listMsg = createListMessage(
        `📖 ${help.title}`,
        'Tap a command or type it manually.',
        'View Commands',
        sections
      );
      await this.sock.sendMessage(sender, listMsg);
    } catch {
      let msg = `*${help.title}*\n\n`;
      for (const c of help.commands) {
        msg += `\`${c.cmd}\`\n${c.desc}\n\n`;
      }
      await reply(msg.trim());
    }
    return true;
  }
}

module.exports = MenusFeature;
