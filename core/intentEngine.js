const SentimentAnalyzer = require('./sentimentAnalyzer');

class IntentEngine {
  constructor(aiRouter) {
    this.aiRouter = aiRouter;
    this.sentimentAnalyzer = new SentimentAnalyzer();
  }

  classify(text) {
    const lower = text.toLowerCase().trim();

    const keywordResult = this._keywordMatch(lower);
    if (keywordResult && keywordResult.confidence > 0.7) {
      return keywordResult;
    }

    return this._aiFallback(text);
  }

  _keywordMatch(text) {
    const patterns = [
      { intent: 'greeting', keywords: ['hi', 'hello', 'hey', 'good morning', 'good evening', 'good afternoon', 'yo', 'sup', 'howdy'], weight: 1 },
      { intent: 'order_status', keywords: ['order', 'where is my', 'tracking', 'shipment', 'delivery', 'my order', 'order status'], weight: 1 },
      { intent: 'appointment', keywords: ['appointment', 'book', 'schedule', 'reserve', 'slot', 'availability'], weight: 1 },
      { intent: 'faq', keywords: ['how', 'what is', 'how do', 'where can', 'when', 'why', 'tell me about', 'explain'], weight: 0.8 },
      { intent: 'complaint', keywords: ['complaint', 'issue', 'problem', 'not working', 'broken', 'error', 'bug'], weight: 1 },
      { intent: 'feedback', keywords: ['feedback', 'suggestion', 'review', 'rate', 'rating'], weight: 1 },
      { intent: 'game', keywords: ['play', 'game', 'quiz', 'trivia', 'rps', 'tictactoe', 'guess'], weight: 1 },
      { intent: 'translation', keywords: ['translate', 'translation', 'in ', 'to english', 'to spanish', 'to french'], weight: 0.7 },
    ];

    let best = null;
    let bestScore = 0;

    for (const pattern of patterns) {
      let score = 0;
      for (const kw of pattern.keywords) {
        if (text.includes(kw)) {
          score += pattern.weight;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = { intent: pattern.intent, confidence: Math.min(1, score / 2), entities: {} };
      }
    }

    if (best && best.confidence >= 0.4) {
      if (best.intent === 'order_status') {
        const orderMatch = text.match(/order[:\s]*([a-z0-9-]+)/i);
        if (orderMatch) {
          best.entities = { orderId: orderMatch[1] };
        }
      }
      if (best.intent === 'appointment') {
        const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
        if (dateMatch) {
          best.entities = { date: dateMatch[0] };
        }
      }
      return best;
    }

    return null;
  }

  async _aiFallback(text) {
    try {
      const sentiment = this.sentimentAnalyzer.analyze(text);
      const prompt = `Classify the intent of this message. Categories: greeting, order_status, appointment, faq, complaint, feedback, game, translation, general. Respond with JSON: {"intent": "...", "confidence": 0.0-1.0, "sentiment": "...", "urgency": 0.0-1.0}\n\nMessage: "${text}"`;

      const result = await this.aiRouter.route('deepseek', prompt, { system: 'You are an intent classifier. Respond only with valid JSON.' });
      const parsed = JSON.parse(result || '{}');
      return {
        intent: parsed.intent || 'general',
        confidence: parsed.confidence || 0.5,
        entities: {},
        sentiment: parsed.sentiment || sentiment.sentiment,
        urgency: parsed.urgency || sentiment.urgency,
      };
    } catch {
      return {
        intent: 'general',
        confidence: 0.3,
        entities: {},
        sentiment: this.sentimentAnalyzer.analyze(text).sentiment,
      };
    }
  }
}

module.exports = IntentEngine;
