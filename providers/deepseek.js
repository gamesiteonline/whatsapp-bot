const BaseProvider = require('./baseProvider');
const axios = require('axios');

class DeepSeekProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseUrl = (config.deepseek && config.deepseek.baseUrl) || 'https://api.deepseek.com';
    this.apiKey = config.deepseek && config.deepseek.apiKey;
  }

  supports(method) {
    const supported = {
      text: true,
      vision: false,
      audio: false,
      imageGen: false,
    };
    return supported[method] || false;
  }

  async chat(messages, options) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/chat/completions`,
        {
          model: 'deepseek-chat',
          messages,
          temperature: (options && options.temperature) || 0.7,
          max_tokens: (options && options.maxTokens) || 2048,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 60000,
        }
      );

      return {
        content: response.data.choices[0].message.content,
        usage: response.data.usage,
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

module.exports = DeepSeekProvider;
