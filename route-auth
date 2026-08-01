// routes/auth.js — register / login for regular (non-admin) users.
// PINs are hashed with bcrypt before storage — never stored in plain text.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { requireAuth } = require('./mw-auth');

const router = express.Router();

function signUser(username) {
  return jwt.sign({ username, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

router.post('/register', (req, res) => {
  const { username, pin, contact, bank } = req.body || {};
  if (!username || !pin || !contact) {
    return res.status(400).json({ error: 'กรอกข้อมูลให้ครบทุกช่อง' });
  }
  if (!/^[0-9]{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4-6 หลัก' });
  }
  const existing = db.prepare('SELECT username FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
  }
  const pinHash = bcrypt.hashSync(pin, 10);
  db.prepare(
    'INSERT INTO users (username, pin_hash, contact, bank, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(username, pinHash, contact, bank || '', Date.now());

  res.json({ token: signUser(username), username });
});

router.post('/login', (req, res) => {
  const { username, pin } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(pin || '', user.pin_hash)) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง' });
  }
  res.json({ token: signUser(username), username });
});

// Current user's profile (contact/bank), and updating the bank field.
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT username, contact, bank FROM users WHERE username = ?').get(req.user.username);
  res.json(user);
});

router.put('/me/bank', requireAuth, (req, res) => {
  const { bank } = req.body || {};
  db.prepare('UPDATE users SET bank = ? WHERE username = ?').run(bank || '', req.user.username);
  res.json({ ok: true });
});

module.exports = router;
