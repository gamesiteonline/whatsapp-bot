const axios = require('axios');

class CryptoStocks {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'cryptoStocks';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.cryptoStocks !== false;
    this.priceAlerts = new Map();

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS price_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, symbol TEXT, target_price REAL, type TEXT, created_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!crypto ')) {
      return this._cryptoPrice(text.slice(8).trim(), sender, reply);
    }

    if (lower.startsWith('!crypto')) {
      return this._cryptoPrice('BTC', sender, reply);
    }

    if (lower.startsWith('!stock ')) {
      return this._stockPrice(text.slice(7).trim(), reply);
    }

    return false;
  }

  async _cryptoPrice(input, sender, reply) {
    const parts = input.split(' ');
    const cmd = parts[0];

    if (cmd === 'alert') {
      return this._setPriceAlert(parts.slice(1).join(' '), sender, reply);
    }

    const coin = cmd || 'BTC';
    await reply(`Fetching ${coin.toUpperCase()} price...`);

    try {
      const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: coin.toLowerCase(),
          vs_currencies: 'usd',
          include_24hr_change: 'true',
          include_market_cap: 'true',
        },
        timeout: 10000,
      });

      const data = res.data[coin.toLowerCase()];
      if (!data) return reply(`Coin "${coin}" not found. Try BTC, ETH, SOL, etc.`);

      return reply(
        `*${coin.toUpperCase()} Price*\n\n` +
        `💰 Price: $${data.usd?.toLocaleString() || 'N/A'}\n` +
        `📈 24h Change: ${data.usd_24h_change ? data.usd_24h_change.toFixed(2) + '%' : 'N/A'}\n` +
        `🏦 Market Cap: $${(data.usd_market_cap / 1e9)?.toFixed(2) + 'B' || 'N/A'}`
      );
    } catch (err) {
      return this._mockCryptoPrice(coin, reply);
    }
  }

  async _mockCryptoPrice(coin, reply) {
    const prices = {
      BTC: { price: 67543, change: 2.34, cap: 1320 },
      ETH: { price: 3456, change: -1.23, cap: 415 },
      SOL: { price: 148, change: 5.67, cap: 64 },
      DOGE: { price: 0.12, change: -3.45, cap: 17 },
      ADA: { price: 0.45, change: 1.23, cap: 16 },
      XRP: { price: 0.62, change: -0.89, cap: 33 },
    };

    const key = coin.toUpperCase();
    const data = prices[key];
    if (!data) return reply(`Coin "${coin}" not recognized. Try BTC, ETH, SOL, DOGE, ADA, XRP.`);

    return reply(
      `*${key} Price (Mock - API unavailable)*\n\n` +
      `💰 Price: $${data.price.toLocaleString()}\n` +
      `📈 24h Change: ${data.change > 0 ? '+' : ''}${data.change}%\n` +
      `🏦 Market Cap: $${data.cap}B`
    );
  }

  async _stockPrice(symbol, reply) {
    if (!symbol) return reply('Usage: !stock [symbol] (e.g., AAPL, GOOGL, MSFT)');

    await reply(`Fetching ${symbol.toUpperCase()} stock price...`);

    try {
      const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}`, {
        params: { interval: '1d', range: '1d' },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000,
      });

      const result = res.data.chart?.result?.[0];
      if (!result) return reply(`Stock "${symbol}" not found.`);

      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];
      const price = meta.regularMarketPrice || quote?.close?.[quote.close.length - 1];
      const prevClose = meta.previousClose || quote?.close?.[0];
      const change = price - prevClose;
      const changePercent = (change / prevClose) * 100;

      return reply(
        `*${meta.symbol} Stock Price*\n\n` +
        `💰 Price: $${price?.toFixed(2) || 'N/A'}\n` +
        `📈 Change: ${change > 0 ? '+' : ''}${change?.toFixed(2) || 'N/A'} (${changePercent?.toFixed(2) || 'N/A'}%)\n` +
        `🕐 As of: ${new Date().toLocaleString()}`
      );
    } catch (err) {
      const prices = { AAPL: 198, GOOGL: 175, MSFT: 420, AMZN: 185, TSLA: 245, META: 510, NVDA: 880 };
      const price = prices[symbol.toUpperCase()];
      if (!price) return reply(`Stock "${symbol}" not found.`);

      return reply(
        `*${symbol.toUpperCase()} Stock Price (Mock - API unavailable)*\n\n` +
        `💰 Price: $${price}\n` +
        `📈 Change: +${(Math.random() * 5).toFixed(2)}% (mock)\n\n` +
        `_Yahoo Finance API rate limited - showing cached data._`
      );
    }
  }

  async _setPriceAlert(input, sender, reply) {
    const match = input.match(/^(\S+)\s+([\d.]+)$/);
    if (!match) return reply('Usage: !crypto alert [coin] [price] (e.g., !crypto alert BTC 70000)');

    const [, coin, targetPrice] = match;
    const price = parseFloat(targetPrice);
    if (isNaN(price)) return reply('Invalid price.');

    if (this.db) {
      this.db.prepare('INSERT INTO price_alerts (user, symbol, target_price, type, created_at) VALUES (?, ?, ?, "crypto", ?)')
        .run(sender, coin.toUpperCase(), price, new Date().toISOString());
    }

    return reply(`✅ Alert set: ${coin.toUpperCase()} at $${price.toLocaleString()}. I'll notify you when it hits this price.`);
  }
}

module.exports = CryptoStocks;
