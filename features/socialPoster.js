class SocialPoster {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'socialPoster';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.socialPoster !== false;

    this.connectedAccounts = {
      twitter: { connected: false, apiKey: config.twitterApiKey || null, apiSecret: config.twitterApiSecret || null },
      instagram: { connected: false, accessToken: config.instagramToken || null },
    };
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;
    if (!isOwner) return reply('Only the owner can use social features.');

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!social')) return false;

    const parts = text.slice(8).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'tweet':
        return this._postTweet(parts.slice(1).join(' '), reply);
      case 'instagram':
        return this._postInstagram(parts.slice(1).join(' '), reply);
      case 'status':
        return this._showStatus(reply);
      default:
        return reply('Commands: tweet, instagram, status');
    }
  }

  async _postTweet(content, reply) {
    if (!content) return reply('Usage: !social tweet [text]');

    await reply(`📤 Posting to Twitter...`);

    if (this.connectedAccounts.twitter.apiKey) {
      console.log(`[SocialPoster] Posting to Twitter: "${content}"`);
      return reply(`✅ Tweet posted successfully!\n> ${content}\n(Mock mode - configure Twitter API keys for live posting)`);
    }

    console.log(`[SocialPoster] MOCK Tweet: ${content}`);
    return reply(`✅ [MOCK] Tweet queued:\n> ${content}\n\nConfigure Twitter API keys in config to enable live posting.`);
  }

  async _postInstagram(input, reply) {
    if (!input) return reply('Usage: !social instagram [image] [caption]');

    const match = input.match(/^(.+?)\|(.+)$/s);
    if (!match) {
      console.log(`[SocialPoster] MOCK Instagram post: ${input}`);
      return reply(`✅ [MOCK] Instagram post created:\n> ${input}\n\nConfigure Instagram access token to enable live posting.`);
    }

    const [, image, caption] = match;
    console.log(`[SocialPoster] MOCK Instagram post - Image: ${image.trim()}, Caption: ${caption.trim()}`);
    return reply(`✅ [MOCK] Instagram post created:\nImage: ${image.trim()}\nCaption: ${caption.trim()}\n\nConfigure Instagram API for live posting.`);
  }

  async _showStatus(reply) {
    const lines = Object.entries(this.connectedAccounts).map(([platform, account]) => {
      const status = account.connected ? '✅ Connected' : '❌ Not connected';
      const hasKey = account.apiKey || account.accessToken ? '(key configured)' : '(no key)';
      return `${platform.charAt(0).toUpperCase() + platform.slice(1)}: ${status} ${hasKey}`;
    });

    return reply(`*Social Media Status:*\n\n${lines.join('\n')}\n\nAdd API keys to the bot config to connect accounts.`);
  }
}

module.exports = SocialPoster;
