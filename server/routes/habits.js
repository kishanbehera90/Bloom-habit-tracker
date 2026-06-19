const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in.' });
  next();
}
router.use(requireLogin);

async function withHistory(habit) {
  const result = await pool.query('SELECT date_key FROM completions WHERE habit_id = $1', [habit.id]);
  const history = {};
  result.rows.forEach((r) => (history[r.date_key] = true));
  return {
    id: String(habit.id),
    name: habit.name,
    category: habit.category,
    icon: habit.icon,
    targetPerWeek: habit.target_per_week,
    createdAt: habit.created_at,
    history,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM habits WHERE user_id = $1 ORDER BY created_at ASC', [
      req.session.userId,
    ]);
    const habits = await Promise.all(result.rows.map(withHistory));
    res.json({ habits });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, category, icon, targetPerWeek } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Habit name is required.' });

    const freq = Math.min(7, Math.max(1, parseInt(targetPerWeek, 10) || 1));
    const result = await pool.query(
      'INSERT INTO habits (user_id, name, category, icon, target_per_week) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.session.userId, String(name).trim(), category || 'Custom', icon || '🌟', freq]
    );

    res.status(201).json({ habit: await withHistory(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

async function getOwnedHabit(req, res) {
  const result = await pool.query('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.session.userId,
  ]);
  const habit = result.rows[0];
  if (!habit) {
    res.status(404).json({ error: 'Habit not found.' });
    return null;
  }
  return habit;
}

router.put('/:id', async (req, res, next) => {
  try {
    const habit = await getOwnedHabit(req, res);
    if (!habit) return;

    const { name, category, icon, targetPerWeek } = req.body || {};
    const freq = Math.min(7, Math.max(1, parseInt(targetPerWeek, 10) || habit.target_per_week));

    const result = await pool.query(
      'UPDATE habits SET name = $1, category = $2, icon = $3, target_per_week = $4 WHERE id = $5 RETURNING *',
      [
        name ? String(name).trim() : habit.name,
        category || habit.category,
        icon || habit.icon,
        freq,
        habit.id,
      ]
    );

    res.json({ habit: await withHistory(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const habit = await getOwnedHabit(req, res);
    if (!habit) return;
    await pool.query('DELETE FROM habits WHERE id = $1', [habit.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/toggle', async (req, res, next) => {
  try {
    const habit = await getOwnedHabit(req, res);
    if (!habit) return;

    const dateKey = (req.body && req.body.dateKey) || new Date().toISOString().slice(0, 10);
    const existing = await pool.query('SELECT id FROM completions WHERE habit_id = $1 AND date_key = $2', [
      habit.id,
      dateKey,
    ]);

    if (existing.rows.length) {
      await pool.query('DELETE FROM completions WHERE id = $1', [existing.rows[0].id]);
    } else {
      await pool.query('INSERT INTO completions (habit_id, date_key) VALUES ($1, $2)', [habit.id, dateKey]);
    }

    const updated = await pool.query('SELECT * FROM habits WHERE id = $1', [habit.id]);
    res.json({ habit: await withHistory(updated.rows[0]) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
