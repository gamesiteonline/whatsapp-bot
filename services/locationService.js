const path = require('path');
const fs = require('fs');

class LocationService {
  constructor(config) {
    this.config = config || {};
    this.dbPath = config.dbPath || path.resolve(process.cwd(), 'data', 'locations.db');
    this._initDB();
  }

  _initDB() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let sqlite3;
    try {
      sqlite3 = require('better-sqlite3');
    } catch (err) {
      return;
    }

    if (!this.db) {
      this.db = new sqlite3(this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS branch_locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          address TEXT,
          phone TEXT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          hours TEXT,
          services TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }
  }

  _toRadians(deg) {
    return deg * (Math.PI / 180);
  }

  _haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this._toRadians(lat2 - lat1);
    const dLon = this._toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRadians(lat1)) *
        Math.cos(this._toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async findNearestBranch(lat, lon) {
    if (!this.db) {
      return { error: 'Database not available' };
    }

    try {
      const branches = this.db.prepare('SELECT * FROM branch_locations').all();

      const withDistance = branches.map((branch) => ({
        ...branch,
        distance: this._haversine(lat, lon, branch.latitude, branch.longitude),
      }));

      withDistance.sort((a, b) => a.distance - b.distance);

      return withDistance.slice(0, 3);
    } catch (err) {
      return { error: err.message };
    }
  }

  async getBranchInfo(name) {
    if (!this.db) {
      return { error: 'Database not available' };
    }

    try {
      const branch = this.db
        .prepare('SELECT * FROM branch_locations WHERE name = ?')
        .get(name);

      if (!branch) {
        return { error: `Branch "${name}" not found` };
      }

      return branch;
    } catch (err) {
      return { error: err.message };
    }
  }
}

module.exports = LocationService;
