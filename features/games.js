class Games {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'games';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.games !== false;
    this.activeGames = new Map();
    this.triviaQuestions = this._loadTriviaQuestions();

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS game_scores (user TEXT PRIMARY KEY, score INTEGER DEFAULT 0, games_played INTEGER DEFAULT 0, updated_at TEXT)').run();
      } catch {}
    }
  }

  _loadTriviaQuestions() {
    return [
      { q: 'What is the capital of France?', a: 'Paris', cat: 'geography' },
      { q: 'What is 2 + 2?', a: '4', cat: 'math' },
      { q: 'Who wrote Romeo and Juliet?', a: 'Shakespeare', cat: 'literature' },
      { q: 'What planet is known as the Red Planet?', a: 'Mars', cat: 'science' },
      { q: 'What is the largest ocean?', a: 'Pacific', cat: 'geography' },
      { q: 'What year did WWII end?', a: '1945', cat: 'history' },
      { q: 'What is the chemical symbol for water?', a: 'H2O', cat: 'science' },
      { q: 'Who painted the Mona Lisa?', a: 'Da Vinci', cat: 'art' },
      { q: 'What is the fastest land animal?', a: 'Cheetah', cat: 'science' },
      { q: 'What is the smallest country?', a: 'Vatican City', cat: 'geography' },
      { q: 'What language has the most native speakers?', a: 'Mandarin', cat: 'language' },
      { q: 'What is the square root of 144?', a: '12', cat: 'math' },
      { q: 'Who developed the theory of relativity?', a: 'Einstein', cat: 'science' },
      { q: 'What is the capital of Japan?', a: 'Tokyo', cat: 'geography' },
      { q: 'What element has symbol Au?', a: 'Gold', cat: 'science' },
      { q: 'How many bones in the human body?', a: '206', cat: 'science' },
      { q: 'What is the longest river?', a: 'Nile', cat: 'geography' },
      { q: 'Who was the first US president?', a: 'Washington', cat: 'history' },
      { q: 'What is the speed of light?', a: '299792458 m/s', cat: 'science' },
      { q: 'What animal is the logo of WWF?', a: 'Panda', cat: 'general' },
      { q: 'What is the capital of Australia?', a: 'Canberra', cat: 'geography' },
      { q: 'What year was the Berlin Wall built?', a: '1961', cat: 'history' },
      { q: 'What is the hardest natural substance?', a: 'Diamond', cat: 'science' },
      { q: 'Who invented the telephone?', a: 'Bell', cat: 'science' },
      { q: 'What is the largest mammal?', a: 'Blue whale', cat: 'science' },
      { q: 'What country invented pizza?', a: 'Italy', cat: 'general' },
      { q: 'What is the capital of Egypt?', a: 'Cairo', cat: 'geography' },
      { q: 'How many sides does a hexagon have?', a: '6', cat: 'math' },
      { q: 'Who founded Microsoft?', a: 'Bill Gates', cat: 'tech' },
      { q: 'What is the largest desert?', a: 'Antarctica', cat: 'geography' },
      { q: 'What planet has the most moons?', a: 'Saturn', cat: 'science' },
      { q: 'What year was the UN founded?', a: '1945', cat: 'history' },
      { q: 'What is the symbol for potassium?', a: 'K', cat: 'science' },
      { q: 'What is the longest bone in the body?', a: 'Femur', cat: 'science' },
      { q: 'What country has the most population?', a: 'India', cat: 'geography' },
      { q: 'Who discovered penicillin?', a: 'Fleming', cat: 'science' },
      { q: 'What is the tallest mountain?', a: 'Everest', cat: 'geography' },
      { q: 'What element is needed for combustion?', a: 'Oxygen', cat: 'science' },
      { q: 'How many continents are there?', a: '7', cat: 'geography' },
      { q: 'What is the currency of Japan?', a: 'Yen', cat: 'finance' },
      { q: 'Who was the first woman in space?', a: 'Tereshkova', cat: 'science' },
      { q: 'What animal can change color?', a: 'Chameleon', cat: 'science' },
      { q: 'What is the smallest planet?', a: 'Mercury', cat: 'science' },
      { q: 'How many teeth do adults have?', a: '32', cat: 'science' },
      { q: 'What is the capital of Brazil?', a: 'Brasilia', cat: 'geography' },
      { q: 'Who wrote 1984?', a: 'Orwell', cat: 'literature' },
      { q: 'What gas do plants absorb?', a: 'CO2', cat: 'science' },
      { q: 'What year was the first iPhone released?', a: '2007', cat: 'tech' },
      { q: 'What is the largest organ?', a: 'Skin', cat: 'science' },
      { q: 'What planet is furthest from the sun?', a: 'Neptune', cat: 'science' },
    ];
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!trivia')) {
      const cat = text.slice(8).trim() || null;
      return this._startTrivia(sender, cat, reply);
    }

    if (lower.startsWith('!answer ')) {
      const answer = text.slice(8).trim();
      return this._answerTrivia(sender, answer, reply);
    }

    if (lower === '!score') {
      return this._showScore(sender, reply);
    }

    if (lower === '!leaderboard') {
      return this._showLeaderboard(reply);
    }

    if (lower === '!quiz') {
      return this._randomQuiz(reply);
    }

    return false;
  }

  async _startTrivia(sender, category, reply) {
    const questions = category
      ? this.triviaQuestions.filter(q => q.cat === category)
      : this.triviaQuestions;

    if (questions.length < 10) return reply(`Not enough questions for category "${category || 'any'}".`);

    const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, 10);
    this.activeGames.set(sender, {
      questions: shuffled,
      index: 0,
      correct: 0,
    });

    const first = shuffled[0];
    return reply(
      `*Trivia Game Started!* (${category || 'mixed'})\n\n` +
      `Question 1/10:\n${first.q}\n\nType !answer [your answer]`
    );
  }

  async _answerTrivia(sender, answer, reply) {
    const game = this.activeGames.get(sender);
    if (!game) return reply('You have no active trivia game. Start one with !trivia [category].');

    const current = game.questions[game.index];
    const isCorrect = current.a.toLowerCase() === answer.toLowerCase();
    if (isCorrect) game.correct++;

    game.index++;

    if (game.index >= game.questions.length) {
      this.activeGames.delete(sender);
      this._saveScore(sender, game.correct);

      return reply(
        `*Game Over!*\nCorrect: ${game.correct}/${game.questions.length}\n\n` +
        (game.correct >= 7 ? 'Great job!' : game.correct >= 4 ? 'Not bad!' : 'Better luck next time!')
      );
    }

    const next = game.questions[game.index];
    return reply(
      `${isCorrect ? '✅ Correct!' : '❌ Incorrect!'}\n\n` +
      `Question ${game.index + 1}/${game.questions.length}:\n${next.q}`
    );
  }

  async _showScore(sender, reply) {
    if (!this.db) return reply('Score tracking unavailable.');
    const row = this.db.prepare('SELECT score, games_played FROM game_scores WHERE user = ?').get(sender);
    if (!row) return reply('You have no scores yet. Play a game with !trivia!');
    return reply(`*Your Stats*\nScore: ${row.score}\nGames Played: ${row.games_played}`);
  }

  async _showLeaderboard(reply) {
    if (!this.db) return reply('Leaderboard unavailable.');
    const rows = this.db.prepare('SELECT user, score FROM game_scores ORDER BY score DESC LIMIT 10').all();
    if (!rows.length) return reply('No scores yet.');

    const lines = rows.map((r, i) => `${i + 1}. ${r.user.split('@')[0]} - ${r.score} pts`);
    return reply(`*Leaderboard Top 10*\n\n${lines.join('\n')}`);
  }

  async _randomQuiz(reply) {
    const q = this.triviaQuestions[Math.floor(Math.random() * this.triviaQuestions.length)];
    return reply(`*Quick Quiz!*\n\n${q.q}\n(category: ${q.cat})`);
  }

  _saveScore(user, correct) {
    if (!this.db) return;
    try {
      const existing = this.db.prepare('SELECT score, games_played FROM game_scores WHERE user = ?').get(user);
      if (existing) {
        this.db.prepare('UPDATE game_scores SET score = score + ?, games_played = games_played + 1, updated_at = ? WHERE user = ?').run(correct, new Date().toISOString(), user);
      } else {
        this.db.prepare('INSERT INTO game_scores (user, score, games_played, updated_at) VALUES (?, ?, 1, ?)').run(user, correct, new Date().toISOString());
      }
    } catch {}
  }
}

module.exports = Games;
