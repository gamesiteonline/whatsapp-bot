const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const dbPath = path.resolve(__dirname, '..', config.dbPath);

class Statement {
  constructor(sqlDb, sql) {
    this.sqlDb = sqlDb;
    this.sql = sql;
  }
  run(...params) {
    this.sqlDb.run(this.sql, params);
  }
  get(...params) {
    const stmt = this.sqlDb.prepare(this.sql);
    if (params.length) stmt.bind(params);
    if (stmt.step()) {
      const result = stmt.getAsObject();
      stmt.free();
      return result;
    }
    stmt.free();
    return undefined;
  }
  all(...params) {
    const stmt = this.sqlDb.prepare(this.sql);
    if (params.length) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }
}

class Database {
  constructor(sqlDb) {
    this.sqlDb = sqlDb;
    this.needsSave = false;
  }
  prepare(sql) {
    return new Statement(this.sqlDb, sql);
  }
  exec(sql) {
    this.sqlDb.exec(sql);
  }
  pragma(sql) {
    this.sqlDb.exec(sql);
  }
  save() {
    const data = this.sqlDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;
  throw new Error('Database not initialized. Call initDatabase() first.');
}

async function initDatabase() {
  const SQL = await initSqlJs();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let sqlDb;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.run('PRAGMA journal_mode = WAL');
  sqlDb.run('PRAGMA foreign_keys = ON');

  dbInstance = new Database(sqlDb);

  setInterval(() => {
    try { dbInstance.save(); } catch (e) {}
  }, 30000);

  process.on('exit', () => {
    try { dbInstance.save(); } catch (e) {}
  });

  return dbInstance;
}

module.exports = { initDatabase, getDb };
