class SentimentAnalyzer {
  constructor() {
    this.positiveWords = [
      'good', 'great', 'awesome', 'excellent', 'amazing', 'fantastic', 'wonderful',
      'love', 'happy', 'glad', 'perfect', 'nice', 'best', 'beautiful', 'thanks',
      'thank', 'appreciate', 'helpful', 'brilliant', 'superb', 'outstanding',
    ];

    this.negativeWords = [
      'bad', 'terrible', 'horrible', 'awful', 'worst', 'hate', 'angry', 'upset',
      'disappointed', 'frustrating', 'frustrated', 'useless', 'poor', 'waste',
      'annoying', 'annoyed', 'slow', 'broken', 'damn', 'stupid', 'sucks',
    ];

    this.angryWords = [
      'furious', 'livid', 'outraged', 'fuming', 'seething', 'infuriated', 'enraged',
      'irate', 'apoplectic', 'lose it', 'pissed', 'pissed off', 'shut up', 'dumb',
    ];

    this.urgentWords = [
      'urgent', 'asap', 'emergency', 'immediately', 'right now', 'hurry', 'quick',
      'important', 'critical', 'deadline', 'soon', 'now', 'help', 'crisis',
    ];
  }

  analyze(text) {
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);

    let positiveScore = 0;
    let negativeScore = 0;
    let angryScore = 0;
    let urgentScore = 0;

    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, '');
      if (this.positiveWords.includes(clean)) positiveScore++;
      if (this.negativeWords.includes(clean)) negativeScore++;
      if (this.angryWords.includes(clean)) angryScore++;
      if (this.urgentWords.includes(clean)) urgentScore++;
    }

    const total = positiveScore + negativeScore;
    const score = total === 0 ? 0 : ((positiveScore - negativeScore) / (positiveScore + negativeScore));
    const clampedScore = Math.max(-1, Math.min(1, score));

    let sentiment = 'neutral';
    if (angryScore > 0 && angryScore >= negativeScore) {
      sentiment = 'angry';
    } else if (clampedScore > 0.2) {
      sentiment = 'positive';
    } else if (clampedScore < -0.2) {
      sentiment = 'negative';
    }

    const urgency = Math.min(1, urgentScore / 3);

    return {
      sentiment,
      score: clampedScore,
      urgency,
    };
  }
}

module.exports = SentimentAnalyzer;
