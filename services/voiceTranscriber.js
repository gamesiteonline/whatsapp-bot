class VoiceTranscriber {
  constructor(openaiProvider) {
    this.openaiProvider = openaiProvider;
  }

  async transcribe(audioBuffer, mimeType) {
    return this.openaiProvider.transcribe(audioBuffer, mimeType);
  }
}

module.exports = VoiceTranscriber;
