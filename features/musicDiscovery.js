const axios = require('axios');

class MusicDiscovery {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'musicDiscovery';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.musicDiscovery !== false;

    this.mockLyrics = new Map();
    this.genreRecommendations = {
      pop: ['Blinding Lights - The Weeknd', 'Shape of You - Ed Sheeran', 'Levitating - Dua Lipa'],
      rock: ['Bohemian Rhapsody - Queen', 'Stairway to Heaven - Led Zeppelin', 'Smells Like Teen Spirit - Nirvana'],
      hiphop: ['HUMBLE - Kendrick Lamar', 'God\'s Plan - Drake', 'Sicko Mode - Travis Scott'],
      electronic: ['Strobe - Deadmau5', 'Levels - Avicii', 'Animals - Martin Garrix'],
      jazz: ['Take Five - Dave Brubeck', 'So What - Miles Davis', 'Feeling Good - Nina Simone'],
      classical: ['Canon in D - Pachelbel', 'Für Elise - Beethoven', 'The Four Seasons - Vivaldi'],
      rnb: ['Blame It - Jamie Foxx', 'Adorn - Miguel', 'Pony - Ginuwine'],
      indie: ['Dog Days Are Over - Florence + The Machine', 'Electric Feel - MGMT', 'Sunday Morning - The Velvet Underground'],
    };
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!music')) return false;

    const parts = text.slice(7).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'search':
        return this._searchSong(parts.slice(1).join(' '), reply);
      case 'lyrics':
        return this._getLyrics(parts.slice(1).join(' '), reply);
      case 'recommend':
        return this._recommend(parts.slice(1).join(' '), reply);
      default:
        return reply('Commands: search, lyrics, recommend');
    }
  }

  async _searchSong(query, reply) {
    if (!query) return reply('Usage: !music search [query]');

    await reply(`Searching for "${query}"...`);

    try {
      const res = await axios.get('https://musicbrainz.org/ws/2/recording', {
        params: { query, limit: 5, fmt: 'json' },
        headers: { 'User-Agent': 'WhatsAppBot/1.0 (your@email.com)' },
        timeout: 10000,
      });

      const recordings = res.data.recordings || [];
      if (!recordings.length) {
        return this._mockSearch(query, reply);
      }

      const lines = recordings.map((r, i) => {
        const artists = (r.artistCredit || []).map(a => a.name).join(', ');
        return `${i + 1}. ${r.title} - ${artists} (${r.length ? Math.round(r.length / 1000) + 's' : 'N/A'})`;
      });

      return reply(`*Search Results:*\n\n${lines.join('\n')}`);
    } catch {
      return this._mockSearch(query, reply);
    }
  }

  async _mockSearch(query, reply) {
    const mockResults = [
      { title: 'Imagine', artist: 'John Lennon' },
      { title: 'Hotel California', artist: 'Eagles' },
      { title: 'Billie Jean', artist: 'Michael Jackson' },
      { title: 'Sweet Child O\' Mine', artist: 'Guns N\' Roses' },
      { title: 'Bohemian Rhapsody', artist: 'Queen' },
    ];

    const lines = mockResults.map((s, i) => `${i + 1}. ${s.title} - ${s.artist}`);
    return reply(`*Mock Results (API unavailable):*\n\n${lines.join('\n')}`);
  }

  async _getLyrics(song, reply) {
    if (!song) return reply('Usage: !music lyrics [song]');

    const mockLyrics = `(Mock lyrics for "${song}")\n\n` +
      `Verse 1:\nLorem ipsum dolor sit amet...\n\n` +
      `Chorus:\nOoh, this is the song that never ends...\n\n` +
      `Verse 2:\nIt just goes on and on my friends...\n\n` +
      `[API unavailable - showing mock data]`;

    return reply(mockLyrics);
  }

  async _recommend(genre, reply) {
    if (!genre) {
      const available = Object.keys(this.genreRecommendations).join(', ');
      return reply(`Usage: !music recommend [genre]\nAvailable genres: ${available}`);
    }

    const songs = this.genreRecommendations[genre.toLowerCase()];
    if (!songs) return reply(`Genre "${genre}" not found. Available: ${Object.keys(this.genreRecommendations).join(', ')}`);

    const lines = songs.map((s, i) => `${i + 1}. ${s}`);
    return reply(`*${genre.charAt(0).toUpperCase() + genre.slice(1)} Recommendations:*\n\n${lines.join('\n')}`);
  }
}

module.exports = MusicDiscovery;
