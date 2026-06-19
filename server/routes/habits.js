const express = require('express');
const db = require('../db');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in.' });
  next();
}
router.use(requireLogin);

function withHistory(habit) {
  const rows = db.prepare('SELECT date_key FROM completions WHERE habit_id = ?').all(habit.id);
  const history = {};
  rows.forEach((r) => (history[r.date_key] = true));
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

router.get('/', (req, res) => {
  const habits = db
    .prepare('SELECT * FROM habits WHERE user_id = ? ORDER BY created_at ASC')
    .all(req.session.userId);
  res.json({ habits: habits.map(withHistory) });
});

router.post('/', (req, res) => {
  const { name, category, icon, targetPerWeek } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Habit name is required.' });

  const freq = Math.min(7, Math.max(1, parseInt(targetPerWeek, 10) || 1));
  const info = db
    .prepare(
      'INSERT INTO habits (user_id, name, category, icon, target_per_week) VALUES (?, ?, ?, ?, ?)'
    )
    .run(req.session.userId, String(name).trim(), category || 'Custom', icon || '🌟', freq);

  const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ habit: withHistory(habit) });
});

function getOwnedHabit(req, res) {
  const habit = db
    .prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!habit) {
    res.status(404).json({ error: 'Habit not found.' });
    return null;
  }
  return habit;
}

router.put('/:id', (req, res) => {
  const habit = getOwnedHabit(req, res);
  if (!habit) return;

  const { name, category, icon, targetPerWeek } = req.body || {};
  const freq = Math.min(7, Math.max(1, parseInt(targetPerWeek, 10) || habit.target_per_week));

  db.prepare('UPDATE habits SET name = ?, category = ?, icon = ?, target_per_week = ? WHERE id = ?').run(
    name ? String(name).trim() : habit.name,
    category || habit.category,
    icon || habit.icon,
    freq,
    habit.id
  );

  const updated = db.prepare('SELECT * FROM habits WHERE id = ?').get(habit.id);
  res.json({ habit: withHistory(updated) });
});

router.delete('/:id', (req, res) => {
  const habit = getOwnedHabit(req, res);
  if (!habit) return;
  db.prepare('DELETE FROM habits WHERE id = ?').run(habit.id);
  res.json({ ok: true });
});

router.post('/:id/toggle', (req, res) => {
  const habit = getOwnedHabit(req, res);
  if (!habit) return;

  const dateKey = (req.body && req.body.dateKey) || new Date().toISOString().slice(0, 10);
  const existing = db
    .prepare('SELECT id FROM completions WHERE habit_id = ? AND date_key = ?')
    .get(habit.id, dateKey);

  if (existing) {
    db.prepare('DELETE FROM completions WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO completions (habit_id, date_key) VALUES (?, ?)').run(habit.id, dateKey);
  }

  const updated = db.prepare('SELECT * FROM habits WHERE id = ?').get(habit.id);
  res.json({ habit: withHistory(updated) });
});

module.exports = router;
