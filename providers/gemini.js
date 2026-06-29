const BaseProvider = require('./baseProvider');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.gemini && config.gemini.apiKey;
    if (this.apiKey) {
      this.client = new GoogleGenerativeAI(this.apiKey);
    }
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
      const model = this.client.getGenerativeModel({
        model: (options && options.model) || 'gemini-2.0-flash',
      });

      const geminiMessages = this._convertMessages(messages);
      const lastMessage = geminiMessages.pop();

      const chat = model.startChat({
        history: geminiMessages,
        generationConfig: {
          temperature: (options && options.temperature) || 0.7,
          maxOutputTokens: (options && options.maxTokens) || 2048,
        },
      });

      let result;
      if (typeof lastMessage === 'string') {
        result = await chat.sendMessage(lastMessage);
      } else if (lastMessage && lastMessage.parts) {
        result = await chat.sendMessage(lastMessage.parts);
      } else {
        result = await chat.sendMessage(lastMessage);
      }

      const response = result.response;
      return {
        content: response.text(),
        usage: null,
      };
    } catch (err) {
      let message = 'Unknown error';
      if (err.message) {
        message = err.message;
      }
      return { content: null, error: message };
    }
  }

  _convertMessages(messages) {
    const history = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const role = msg.role === 'assistant' ? 'model' : 'user';

      if (msg.role === 'system') {
        history.push({
          role: 'user',
          parts: [{ text: `System instruction: ${msg.content}` }],
        });
        history.push({
          role: 'model',
          parts: [{ text: 'Understood, I will follow these instructions.' }],
        });
        continue;
      }

      if (typeof msg.content === 'string') {
        history.push({
          role,
          parts: [{ text: msg.content }],
        });
      } else if (Array.isArray(msg.content)) {
        const parts = [];
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url') {
            const imageData = part.image_url.url;
            let base64Data = imageData;
            let mimeType = 'image/png';

            if (imageData.startsWith('data:')) {
              const matches = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
              if (matches) {
                mimeType = matches[1];
                base64Data = matches[2];
              }
            }

            parts.push({
              inlineData: {
                mimeType,
                data: base64Data,
              },
            });
          }
        }
        history.push({ role, parts });
      }
    }

    return history;
  }
}

module.exports = GeminiProvider;
