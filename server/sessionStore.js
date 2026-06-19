const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { Store } = require('express-session');

class SqliteSessionStore extends Store {
  constructor({ dataDir }) {
    super();
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'sessions.sqlite'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
    this._prune();
    this._pruneInterval = setInterval(() => this._prune(), 1000 * 60 * 60);
  }

  _prune() {
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires_at < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, session, cb) {
    try {
      const maxAge = session.cookie && session.cookie.maxAge ? session.cookie.maxAge : 1000 * 60 * 60 * 24;
      const expiresAt = Date.now() + maxAge;
      const data = JSON.stringify(session);
      this.db
        .prepare(
          'INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at'
        )
        .run(sid, data, expiresAt);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  touch(sid, session, cb) {
    this.set(sid, session, cb);
  }
}

module.exports = SqliteSessionStore;
