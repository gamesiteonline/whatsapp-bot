const config = require('../config');

class CommandHandler {
  constructor(sock, aiRouter) {
    this.sock = sock;
    this.aiRouter = aiRouter;
    this.prefix = config.prefix;
    this.commands = new Map();

    this.registerCommand('ping', this.ping.bind(this));
    this.registerCommand('menu', this.menu.bind(this));
    this.registerCommand('help', this.help.bind(this));
    this.registerCommand('ai', this.ai.bind(this));
    this.registerCommand('translate', this.translate.bind(this));
    this.registerCommand('feedback', this.feedback.bind(this));
  }

  registerCommand(name, handler) {
    this.commands.set(name.toLowerCase(), handler);
  }

  async ping(args, { reply }) {
    return reply('Pong! 🏓');
  }

  async menu(args, { reply }) {
    const commandsList = Array.from(this.commands.keys())
      .map(cmd => `${this.prefix}${cmd}`)
      .join('\n');
    return reply(`*Available Commands:*\n\n${commandsList}`);
  }

  async help(args, { reply }) {
    const cmd = args[0];
    if (!cmd) {
      return reply(`Usage: ${this.prefix}help <command>\n\nAvailable: ${Array.from(this.commands.keys()).join(', ')}`);
    }
    const helpTexts = {
      ping: 'Check if the bot is responsive.\nUsage: !ping',
      menu: 'Show all available commands.\nUsage: !menu',
      help: 'Get help for a specific command.\nUsage: !help <command>',
      ai: 'Send a message to a specific AI provider.\nUsage: !ai <provider> <message>\nProviders: deepseek, gemini, openai, openrouter',
      translate: 'Translate text to a target language.\nUsage: !translate <lang> <text>',
      feedback: 'Submit feedback with a rating.\nUsage: !feedback <rating> <comment>',
    };
    return reply(helpTexts[cmd] || `No help available for "${cmd}".`);
  }

  async ai(args, { reply }) {
    if (args.length < 2) {
      return reply(`Usage: ${this.prefix}ai <provider> <message>`);
    }
    const provider = args[0].toLowerCase();
    const message = args.slice(1).join(' ');
    const validProviders = ['deepseek', 'gemini', 'openai', 'openrouter'];
    if (!validProviders.includes(provider)) {
      return reply(`Invalid provider. Choose: ${validProviders.join(', ')}`);
    }
    try {
      const response = await this.aiRouter.route(provider, message);
      return reply(response);
    } catch (err) {
      return reply(`Error with ${provider}: ${err.message}`);
    }
  }

  async translate(args, { reply }) {
    if (args.length < 2) {
      return reply(`Usage: ${this.prefix}translate <lang> <text>`);
    }
    const lang = args[0];
    const text = args.slice(1).join(' ');
    try {
      const response = await this.aiRouter.route('gemini', `Translate to ${lang}: ${text}`);
      return reply(`*Translation (${lang}):*\n${response}`);
    } catch (err) {
      return reply(`Translation error: ${err.message}`);
    }
  }

  async feedback(args, { reply }) {
    if (args.length < 1) {
      return reply(`Usage: ${this.prefix}feedback <rating (1-5)> [comment]`);
    }
    const rating = parseInt(args[0], 10);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return reply('Rating must be a number between 1 and 5.');
    }
    const comment = args.slice(1).join(' ') || '';
    const db = require('../database/db');
    db.prepare('INSERT INTO feedback (user_jid, rating, comment, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
      .run(sender, rating, comment);
    return reply(`Thank you for your feedback! (Rating: ${rating}/5)`);
  }

  async handleMessage(msg, text, sender, isGroup, isOwner, reply) {
    if (!text || !text.startsWith(this.prefix)) {
      return null;
    }

    const withoutPrefix = text.slice(this.prefix.length).trim();
    const parts = withoutPrefix.split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commands.get(commandName);
    if (handler) {
      const context = { sender, isGroup, isOwner, reply, msg };
      return handler(args, context);
    }

    if (this.aiRouter) {
      try {
        const response = await this.aiRouter.route('openrouter', text, {
          system: 'You are a helpful WhatsApp bot assistant. Respond conversationally.',
        });
        return reply(response);
      } catch {
        return reply(`Unknown command. Use ${this.prefix}menu to see available commands.`);
      }
    }

    return reply(`Unknown command. Use ${this.prefix}menu to see available commands.`);
  }
}

module.exports = CommandHandler;
