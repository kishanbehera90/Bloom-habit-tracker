const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const router = express.Router();

function publicUser(u) {
  return { id: u.id, username: u.username, displayName: u.display_name, theme: u.theme };
}

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in.' });
  next();
}

router.post('/register', async (req, res, next) => {
  try {
    const { username, password, displayName } = req.body || {};
    if (!username || !password || username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: 'Username (3+ chars) and password (6+ chars) are required.' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length) return res.status(409).json({ error: 'That username is already taken.' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING *',
      [username, hash, displayName || username]
    );

    const user = result.rows[0];
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });

    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in.' });
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Not logged in.' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', requireLogin, async (req, res, next) => {
  try {
    const { displayName } = req.body || {};
    if (!displayName || !String(displayName).trim()) {
      return res.status(400).json({ error: 'Display name is required.' });
    }
    const result = await pool.query('UPDATE users SET display_name = $1 WHERE id = $2 RETURNING *', [
      String(displayName).trim(),
      req.session.userId,
    ]);
    res.json({ user: publicUser(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.put('/theme', requireLogin, async (req, res, next) => {
  try {
    const { theme } = req.body || {};
    if (theme !== 'light' && theme !== 'dark') return res.status(400).json({ error: 'Invalid theme.' });
    const result = await pool.query('UPDATE users SET theme = $1 WHERE id = $2 RETURNING *', [
      theme,
      req.session.userId,
    ]);
    res.json({ user: publicUser(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', requireLogin, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Current password and a new password (6+ chars) are required.' });
    }

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    const user = result.rows[0];
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/reset', requireLogin, async (req, res, next) => {
  try {
    const { currentPassword } = req.body || {};
    if (!currentPassword) return res.status(400).json({ error: 'Enter your password to confirm.' });

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    const user = result.rows[0];
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect password.' });

    // Deleting habits cascades to their completions automatically.
    await pool.query('DELETE FROM habits WHERE user_id = $1', [user.id]);
    await pool.query('DELETE FROM todos WHERE user_id = $1', [user.id]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
