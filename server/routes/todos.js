const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in.' });
  next();
}
router.use(requireLogin);

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function shape(row) {
  return {
    id: String(row.id),
    text: row.text,
    completed: row.completed,
    completedDateKey: row.completed_date_key,
    taskTime: row.task_time,
    createdAt: row.created_at,
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function normalizeTime(time) {
  if (!time) return null;
  return TIME_RE.test(time) ? time : null;
}

// Returns: anything still incomplete (carried over from any previous day),
// plus anything completed today. Tasks completed on a past day quietly drop off the list.
router.get('/', async (req, res, next) => {
  try {
    const today = todayKey();
    const result = await pool.query(
      `SELECT * FROM todos
       WHERE user_id = $1 AND (completed = false OR completed_date_key = $2)
       ORDER BY created_at ASC`,
      [req.session.userId, today]
    );
    res.json({ todos: result.rows.map(shape) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { text, time } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'Task text is required.' });

    const result = await pool.query(
      'INSERT INTO todos (user_id, text, task_time) VALUES ($1, $2, $3) RETURNING *',
      [req.session.userId, String(text).trim(), normalizeTime(time)]
    );
    res.status(201).json({ todo: shape(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// Bulk-create from a pasted list. Each item is { text, time? } already parsed client-side.
router.post('/bulk', async (req, res, next) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'No tasks to add.' });
    }

    const cleaned = items
      .map((it) => ({ text: it && it.text ? String(it.text).trim() : '', time: normalizeTime(it && it.time) }))
      .filter((it) => it.text.length > 0)
      .slice(0, 200);

    if (!cleaned.length) return res.status(400).json({ error: 'No valid tasks to add.' });

    const inserted = [];
    for (const item of cleaned) {
      const result = await pool.query(
        'INSERT INTO todos (user_id, text, task_time) VALUES ($1, $2, $3) RETURNING *',
        [req.session.userId, item.text, item.time]
      );
      inserted.push(shape(result.rows[0]));
    }
    res.status(201).json({ todos: inserted });
  } catch (err) {
    next(err);
  }
});

async function getOwnedTodo(req, res) {
  const result = await pool.query('SELECT * FROM todos WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.session.userId,
  ]);
  const todo = result.rows[0];
  if (!todo) {
    res.status(404).json({ error: 'Task not found.' });
    return null;
  }
  return todo;
}

router.put('/:id', async (req, res, next) => {
  try {
    const todo = await getOwnedTodo(req, res);
    if (!todo) return;
    const { text, time } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'Task text is required.' });

    const result = await pool.query('UPDATE todos SET text = $1, task_time = $2 WHERE id = $3 RETURNING *', [
      String(text).trim(),
      time === undefined ? todo.task_time : normalizeTime(time),
      todo.id,
    ]);
    res.json({ todo: shape(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/toggle', async (req, res, next) => {
  try {
    const todo = await getOwnedTodo(req, res);
    if (!todo) return;

    const nowCompleted = !todo.completed;
    const result = await pool.query(
      'UPDATE todos SET completed = $1, completed_date_key = $2 WHERE id = $3 RETURNING *',
      [nowCompleted, nowCompleted ? todayKey() : null, todo.id]
    );
    res.json({ todo: shape(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const todo = await getOwnedTodo(req, res);
    if (!todo) return;
    await pool.query('DELETE FROM todos WHERE id = $1', [todo.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
