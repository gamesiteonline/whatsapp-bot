class ImageAnalyzer {
  constructor(aiRouter) {
    this.aiRouter = aiRouter;
  }

  async analyze(imageBuffer, mimeType, prompt) {
    const base64 = imageBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;

    const textPrompt = prompt || 'Describe this image in detail.';

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: textPrompt },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ];

    let result;
    try {
      result = await this.aiRouter.chat('vision', messages, { maxTokens: 1024 });
    } catch (err) {
      try {
        result = await this.aiRouter.chat('text', messages, { maxTokens: 1024 });
      } catch (err2) {
        return { content: null, error: `Analysis failed: ${err2.message}` };
      }
    }

    return result;
  }
}

module.exports = ImageAnalyzer;
