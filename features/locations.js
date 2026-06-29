class Locations {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'locations';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.locations !== false;
    this._initBranches();
  }

  _initBranches() {
    if (!this.db) return;

    try {
      this.db.prepare('CREATE TABLE IF NOT EXISTS branch_locations (name TEXT PRIMARY KEY, address TEXT, lat REAL, lng REAL, phone TEXT, hours TEXT, services TEXT)').run();

      const count = this.db.prepare('SELECT COUNT(*) as c FROM branch_locations').get();
      if (count.c === 0) {
        const insert = this.db.prepare('INSERT OR IGNORE INTO branch_locations (name, address, lat, lng, phone, hours, services) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const branches = [
          ['Main Branch', '123 Main St, Downtown', 40.7128, -74.006, '+1-555-0100', '9AM-6PM Mon-Sat', 'general,accounts,support'],
          ['North Branch', '456 North Ave, Uptown', 40.7589, -73.9851, '+1-555-0101', '10AM-7PM Mon-Fri', 'general,support'],
          ['South Branch', '789 South Blvd, Suburb', 40.6782, -73.9442, '+1-555-0102', '8AM-5PM Mon-Sat', 'general,accounts'],
          ['East Branch', '321 East St, Riverside', 40.7282, -73.7949, '+1-555-0103', '9AM-6PM Mon-Fri', 'general,support,loans'],
          ['West Branch', '654 West Rd, Lakeside', 40.7484, -74.0068, '+1-555-0104', '10AM-8PM Mon-Sat', 'general,accounts,support,loans'],
        ];
        for (const b of branches) insert.run(...b);
      }
    } catch {
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    if (msg?.message?.locationMessage || msg?.message?.liveLocationMessage) {
      return this._handleLocationMessage(msg, reply);
    }

    const lower = text.toLowerCase().trim();

    if (lower.startsWith('!nearby ')) {
      const service = text.slice(8).trim();
      if (!service) return reply('Usage: !nearby [service]');
      return this._handleNearby(service, reply);
    }

    if (lower.startsWith('!branch ')) {
      const name = text.slice(8).trim();
      if (!name) return reply('Usage: !branch [name]');
      return this._handleBranch(name, reply);
    }

    return false;
  }

  async _handleLocationMessage(msg, reply) {
    const loc = msg.message.locationMessage || msg.message.liveLocationMessage;
    const lat = loc.degreesLatitude;
    const lng = loc.degreesLongitude;

    const branch = this._findNearest(lat, lng);
    if (!branch) return reply('No branches found near your location.');

    const dist = this._haversine(lat, lng, branch.lat, branch.lng).toFixed(1);
    return reply(
      `*Nearest Branch:* ${branch.name}\n` +
      `*Distance:* ${dist} km\n` +
      `*Address:* ${branch.address}\n` +
      `*Phone:* ${branch.phone}\n` +
      `*Hours:* ${branch.hours}`
    );
  }

  async _handleNearby(service, reply) {
    const branches = this.db
      ? this.db.prepare('SELECT * FROM branch_locations WHERE services LIKE ?').all(`%${service}%`)
      : [];

    if (!branches.length) return reply(`No branches found offering "${service}".`);

    const lines = branches.map(b => `*${b.name}* - ${b.address} (${b.phone})`);
    return reply(`*Branches offering ${service}:*\n\n${lines.join('\n')}`);
  }

  async _handleBranch(name, reply) {
    const branch = this.db
      ? this.db.prepare('SELECT * FROM branch_locations WHERE LOWER(name) LIKE ?').get(`%${name.toLowerCase()}%`)
      : null;

    if (!branch) return reply(`Branch "${name}" not found.`);

    return reply(
      `*${branch.name}*\n` +
      `*Address:* ${branch.address}\n` +
      `*Phone:* ${branch.phone}\n` +
      `*Hours:* ${branch.hours}\n` +
      `*Services:* ${branch.services}`
    );
  }

  _findNearest(lat, lng) {
    if (!this.db) return null;

    const branches = this.db.prepare('SELECT * FROM branch_locations').all();
    let nearest = null;
    let minDist = Infinity;

    for (const b of branches) {
      const dist = this._haversine(lat, lng, b.lat, b.lng);
      if (dist < minDist) {
        minDist = dist;
        nearest = b;
      }
    }

    return nearest;
  }

  _haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this._toRad(lat2 - lat1);
    const dLon = this._toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  _toRad(deg) {
    return (deg * Math.PI) / 180;
  }
}

module.exports = Locations;
