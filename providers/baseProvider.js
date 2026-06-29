class BaseProvider {
  constructor(config) {
    this.config = config || {};
  }

  async chat(messages, options) {
    throw new Error('Not implemented');
  }

  async isAvailable() {
    return true;
  }

  get name() {
    return this.constructor.name;
  }

  supports(method) {
    const supported = {
      vision: false,
      audio: false,
      imageGen: false,
      text: false,
    };
    return supported[method] || false;
  }
}

module.exports = BaseProvider;
