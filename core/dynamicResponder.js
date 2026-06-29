class DynamicResponder {
  constructor(aiRouter, contextMemory) {
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
  }

  async generate(userJid, userMessage, intent) {
    const context = this.contextMemory.getContextForAI(userJid);
    const systemPrompt = this._buildSystemPrompt(intent);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...context,
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await this.aiRouter.route('openrouter', messages, {
        model: 'openai/gpt-4o-mini',
      });

      this.contextMemory.add(userJid, 'user', userMessage);
      this.contextMemory.add(userJid, 'assistant', response);

      return response;
    } catch (err) {
      return `I encountered an error processing your request: ${err.message}`;
    }
  }

  _buildSystemPrompt(intent) {
    const prompts = {
      greeting: 'You are a friendly WhatsApp bot assistant. Greet the user warmly and ask how you can help them today.',
      order_status: 'You are an order management assistant. Help the user check their order status. Be helpful and provide clear information about their order.',
      appointment: 'You are an appointment scheduling assistant. Help the user book, reschedule, or check appointments. Be professional and courteous.',
      faq: 'You are a knowledgeable FAQ assistant. Answer the user\'s questions accurately and concisely based on available information.',
      complaint: 'You are a customer support agent. Listen to the user\'s complaint empathetically and provide solutions. Apologize when appropriate and escalate if needed.',
      feedback: 'You are a feedback collection assistant. Thank the user for their feedback and acknowledge their input politely.',
      game: 'You are a game host. Engage the user in a fun and interactive game experience. Be enthusiastic and encouraging.',
      translation: 'You are a language translation assistant. Translate the user\'s text accurately to the requested language. Preserve the original tone and meaning.',
      general: 'You are a helpful WhatsApp bot assistant. Respond to the user\'s query in a friendly, informative manner. Keep responses concise and useful.',
    };

    return prompts[intent] || prompts.general;
  }
}

module.exports = DynamicResponder;
