class ImageGenerator {
  constructor(openaiProvider) {
    this.openaiProvider = openaiProvider;
  }

  async generate(prompt) {
    return this.openaiProvider.generateImage(prompt);
  }
}

module.exports = ImageGenerator;
