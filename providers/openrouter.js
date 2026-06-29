const BaseProvider = require('./baseProvider');
const OpenAI = require('openai');

class OpenRouterProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseUrl = (config.openrouter && config.openrouter.baseUrl) || 'https://openrouter.ai/api/v1';
    this.apiKey = config.openrouter && config.openrouter.apiKey;
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
  }

  supports(method) {
    const supported = {
      text: true,
      vision: true,
      audio: false,
      imageGen: false,
    };
    return supported[method] || false;
  }

  async chat(messages, options) {
    try {
      const response = await this.client.chat.completions.create({
        model: (options && options.model) || 'openai/gpt-4o-mini',
        messages,
        temperature: (options && options.temperature) || 0.7,
        max_tokens: (options && options.maxTokens) || 2048,
      }, {
        headers: {
          'HTTP-Referer': 'https://github.com/gamesiteonline/whatsapp-bot',
        },
      });

      return {
        content: response.choices[0].message.content,
        usage: response.usage,
      };
    } catch (err) {
      let message = 'Unknown error';
      if (err.response && err.response.data && err.response.data.error) {
        message = err.response.data.error.message || JSON.stringify(err.response.data.error);
      } else if (err.message) {
        message = err.message;
      }
      return { content: null, error: message };
    }
  }
}

module.exports = OpenRouterProvider;
