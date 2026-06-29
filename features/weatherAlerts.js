const axios = require('axios');

class WeatherAlerts {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'weatherAlerts';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.weatherAlerts !== false;
    this.apiKey = config.openWeatherMapApiKey || process.env.OPENWEATHER_API_KEY || 'demo';
    this.alerts = new Map();

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS weather_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, city TEXT, condition TEXT, threshold TEXT, created_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!weather')) return false;

    const parts = text.slice(9).trim().split(' ');
    const cmd = parts[0];

    if (cmd === 'forecast') {
      return this._forecast(parts.slice(1).join(' '), reply);
    }

    if (cmd === 'alert') {
      return this._setAlert(parts.slice(1).join(' '), sender, reply);
    }

    return this._currentWeather(parts.join(' '), reply);
  }

  async _currentWeather(city, reply) {
    if (!city) return reply('Usage: !weather [city]');

    await reply(`Fetching weather for ${city}...`);

    try {
      const res = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: { q: city, appid: this.apiKey, units: 'metric' },
        timeout: 10000,
      });

      const d = res.data;
      return reply(
        `*Weather in ${d.name}, ${d.sys.country}*\n\n` +
        `🌡️ Temperature: ${d.main.temp}°C (feels like ${d.main.feels_like}°C)\n` +
        `☁️ Conditions: ${d.weather[0].description}\n` +
        `💧 Humidity: ${d.main.humidity}%\n` +
        `💨 Wind: ${d.wind.speed} m/s\n` +
        `📊 Pressure: ${d.main.pressure} hPa`
      );
    } catch (err) {
      if (err.response?.status === 401) {
        return this._mockWeather(city, reply);
      }
      if (err.response?.status === 404) {
        return reply(`City "${city}" not found.`);
      }
      return this._mockWeather(city, reply);
    }
  }

  async _mockWeather(city, reply) {
    const conditions = ['Clear sky', 'Few clouds', 'Scattered clouds', 'Light rain', 'Moderate rain', 'Overcast'];
    const cond = conditions[Math.floor(Math.random() * conditions.length)];
    const temp = (15 + Math.random() * 20).toFixed(1);
    const humidity = Math.floor(40 + Math.random() * 40);

    return reply(
      `*Weather in ${city} (Mock Data - API unavailable)*\n\n` +
      `🌡️ Temperature: ${temp}°C\n` +
      `☁️ Conditions: ${cond}\n` +
      `💧 Humidity: ${humidity}%\n` +
      `💨 Wind: ${(2 + Math.random() * 8).toFixed(1)} m/s\n\n` +
      `_Set OPENWEATHER_API_KEY env var for live data._`
    );
  }

  async _forecast(city, reply) {
    if (!city) return reply('Usage: !weather forecast [city]');

    await reply(`Fetching 5-day forecast for ${city}...`);

    try {
      const res = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
        params: { q: city, appid: this.apiKey, units: 'metric' },
        timeout: 10000,
      });

      const daily = {};
      for (const item of res.data.list) {
        const date = item.dt_txt.split(' ')[0];
        if (!daily[date]) {
          daily[date] = { temps: [], conditions: [] };
        }
        daily[date].temps.push(item.main.temp);
        daily[date].conditions.push(item.weather[0].description);
      }

      const lines = Object.entries(daily).slice(0, 5).map(([date, data]) => {
        const avgTemp = (data.temps.reduce((a, b) => a + b, 0) / data.temps.length).toFixed(1);
        const cond = data.conditions[Math.floor(data.conditions.length / 2)];
        const d = new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return `${d}: ${avgTemp}°C, ${cond}`;
      });

      return reply(`*5-Day Forecast for ${res.data.city.name}:*\n\n${lines.join('\n')}`);
    } catch (err) {
      return reply(`Forecast unavailable: ${err.message}`);
    }
  }

  async _setAlert(input, sender, reply) {
    const match = input.match(/^(.+?)\|(.+)$/);
    if (!match) return reply('Usage: !weather alert [city]|[condition] (e.g., !weather alert London|rain)');

    const [, city, condition] = match;

    if (this.db) {
      this.db.prepare('INSERT INTO weather_alerts (user, city, condition, created_at) VALUES (?, ?, ?, ?)')
        .run(sender, city.trim(), condition.trim(), new Date().toISOString());
    }

    this.alerts.set(`${sender}:${city}`, { city: city.trim(), condition: condition.trim() });

    return reply(`✅ Weather alert set for ${city.trim()} when "${condition.trim()}" is detected.\nAlerts are checked periodically.`);
  }
}

module.exports = WeatherAlerts;
