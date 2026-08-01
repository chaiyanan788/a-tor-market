// routes/messages.js — the "contact admin" support chat, user side.
// Admin-side inbox routes live in routes/admin.js.

const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const { requireAuth } = require('./mw-auth');

const router = express.Router();
const newId = () => crypto.randomBytes(8).toString('hex');

// The logged-in user's own conversation with the admin.
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM messages WHERE username = ? ORDER BY created_at ASC')
    .all(req.user.username);
  res.json(rows);
});

router.post('/mine', requireAuth, (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'พิมพ์ข้อความก่อนส่ง' });
  const id = newId();
  db.prepare(`
    INSERT INTO messages (id, username, sender, text, created_at) VALUES (?, ?, 'user', ?, ?)
  `).run(id, req.user.username, text.trim(), Date.now());
  res.json({ id, ok: true });
});

module.exports = router;
