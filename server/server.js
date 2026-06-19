const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SqliteSessionStore = require('./sessionStore');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const habitRoutes = require('./routes/habits');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(express.json());
app.use(
  session({
    store: new SqliteSessionStore({ dataDir }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY === 'true',
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/habits', habitRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.redirect('/login.html');
  }
});

app.listen(PORT, () => {
  console.log(`Bloom habit tracker running on http://localhost:${PORT}`);
});
