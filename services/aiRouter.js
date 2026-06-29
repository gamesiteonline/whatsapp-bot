const path = require('path');
const fs = require('fs');

class AIRouter {
  constructor(config) {
    this.config = config;
    this.providers = {};

    const providerMap = {
      deepseek: 'DeepSeekProvider',
      gemini: 'GeminiProvider',
      openai: 'OpenAIProvider',
      openrouter: 'OpenRouterProvider',
    };

    for (const [key, className] of Object.entries(providerMap)) {
      const ProviderClass = this._loadProvider(key);
      if (ProviderClass && config[key] && config[key].apiKey) {
        this.providers[key] = new ProviderClass(config);
      }
    }
  }

  _loadProvider(name) {
    try {
      const ProviderClass = require(`../providers/${name}`);
      return ProviderClass;
    } catch (err) {
      return null;
    }
  }

  getProvider(feature) {
    const routing = this._loadRouting();
    const providerName = routing[feature];
    if (!providerName) {
      throw new Error(`No provider configured for feature: ${feature}`);
    }
    const provider = this.providers[providerName];
    if (!provider) {
      throw new Error(`Provider "${providerName}" is not configured or not available`);
    }
    return provider;
  }

  async chat(feature, messages, options) {
    const provider = this.getProvider(feature);
    return provider.chat(messages, options);
  }

  isAvailable(providerName) {
    const provider = this.providers[providerName];
    return !!provider;
  }

  listProviders() {
    return Object.keys(this.providers);
  }

  _loadRouting() {
    const routingPath = path.resolve(process.cwd(), 'config', 'aiRouting.json');
    try {
      const data = fs.readFileSync(routingPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return {};
    }
  }
}

module.exports = AIRouter;
