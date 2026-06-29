const BaseProvider = require('./baseProvider');
const OpenAI = require('openai');

class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.primaryKey = config.openai && config.openai.apiKey;
    this.fallbackKey = config.openai && config.openai.fallbackApiKey;
    this.client = new OpenAI({ apiKey: this.primaryKey });
    if (this.fallbackKey) {
      this.fallbackClient = new OpenAI({ apiKey: this.fallbackKey });
    }
  }

  supports(method) {
    const supported = {
      text: true,
      vision: true,
      audio: true,
      imageGen: true,
    };
    return supported[method] || false;
  }

  async chat(messages, options) {
    let lastError;

    for (const client of [this.client, this.fallbackClient]) {
      if (!client) continue;
      try {
        const response = await client.chat.completions.create({
          model: (options && options.model) || 'gpt-4o-mini',
          messages,
          temperature: (options && options.temperature) || 0.7,
          max_tokens: (options && options.maxTokens) || 2048,
        });

        return {
          content: response.choices[0].message.content,
          usage: response.usage,
        };
      } catch (err) {
        lastError = err;
      }
    }

    return { content: null, error: lastError ? lastError.message : 'Unknown error' };
  }

  async transcribe(audioBuffer) {
    let lastError;

    for (const client of [this.client, this.fallbackClient]) {
      if (!client) continue;
      try {
        const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });
        const transcription = await client.audio.transcriptions.create({
          model: 'whisper-1',
          file,
        });
        return transcription.text;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Transcription failed');
  }

  async generateImage(prompt) {
    let lastError;

    for (const client of [this.client, this.fallbackClient]) {
      if (!client) continue;
      try {
        const response = await client.images.generate({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size: '1024x1024',
        });

        return {
          url: response.data[0].url,
          revised_prompt: response.data[0].revised_prompt || prompt,
        };
      } catch (err) {
        lastError = err;
      }
    }

    return { url: null, error: lastError ? lastError.message : 'Unknown error' };
  }
}

module.exports = OpenAIProvider;
