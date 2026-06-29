const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

class VoiceTranscription {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'voiceTranscription';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this._lastAudioMsg = null;
  }

  get enabled() {
    return this.config.features?.voiceTranscription !== false;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    const lower = text.toLowerCase().trim();

    if (msg.message?.audioMessage) {
      this._lastAudioMsg = msg;
      const auto = await this.db.get(`transcribe_auto:${sender}`);
      if (auto) {
        await this._transcribe(msg, reply);
      }
      return false;
    }

    if (lower.startsWith('!transcribe')) {
      const arg = text.split(' ')[1];
      if (arg === 'on') {
        await this.db.set(`transcribe_auto:${sender}`, true);
        await reply('✅ Auto-transcription enabled for voice messages.');
        return true;
      }
      if (arg === 'off') {
        await this.db.delete(`transcribe_auto:${sender}`);
        await reply('✅ Auto-transcription disabled.');
        return true;
      }

      if (this._lastAudioMsg) {
        await this._transcribe(this._lastAudioMsg, reply);
      } else {
        await reply('❌ No recent voice message found. Send a voice note first.');
      }
      return true;
    }

    return false;
  }

  async _transcribe(msg, reply) {
    try {
      await reply('🎤 Transcribing voice message...');

      const stream = await downloadContentFromMessage(msg.message.audioMessage, 'audio');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      const text = await this.aiRouter.transcribe(buffer.toString('base64'));
      if (text) {
        await reply(`📝 *Transcription:*\n\n${text}`);
      } else {
        await reply('❌ Could not transcribe the audio.');
      }
    } catch (err) {
      await reply(`❌ Transcription failed: ${err.message}`);
    }
  }
}

module.exports = VoiceTranscription;
