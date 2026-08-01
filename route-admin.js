// routes/admin.js — everything the admin dashboard needs.
// The admin passcode is stored as a bcrypt hash in admin_config, separate
// from the regular users table (there's only ever one admin passcode).

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');
const { requireAdmin } = require('./mw-auth');

const router = express.Router();
const newId = () => crypto.randomBytes(8).toString('hex');

function signAdmin() {
  return jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
}

// --- Setup / login ---

router.get('/setup-status', (req, res) => {
  const row = db.prepare("SELECT value FROM admin_config WHERE key = 'passcode_hash'").get();
  res.json({ isSetUp: !!row });
});

router.post('/setup', (req, res) => {
  const existing = db.prepare("SELECT value FROM admin_config WHERE key = 'passcode_hash'").get();
  if (existing) return res.status(409).json({ error: 'ตั้งรหัสผ่านแอดมินไปแล้ว กรุณาเข้าสู่ระบบแทน' });
  const { passcode } = req.body || {};
  if (!passcode || passcode.length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }
  const hash = bcrypt.hashSync(passcode, 10);
  db.prepare("INSERT INTO admin_config (key, value) VALUES ('passcode_hash', ?)").run(hash);
  res.json({ token: signAdmin() });
});

router.post('/login', (req, res) => {
  const row = db.prepare("SELECT value FROM admin_config WHERE key = 'passcode_hash'").get();
  if (!row) return res.status(409).json({ error: 'ยังไม่ได้ตั้งรหัสผ่านแอดมิน' });
  const { passcode } = req.body || {};
  if (!bcrypt.compareSync(passcode || '', row.value)) {
    return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  }
  res.json({ token: signAdmin() });
});

// --- Overview ---

router.get('/overview', requireAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const totalListings = db.prepare('SELECT COUNT(*) c FROM listings').get().c;
  const totalValue = db.prepare('SELECT COALESCE(SUM(price * qty), 0) v FROM listings').get().v;
  const recent = db.prepare('SELECT * FROM listings ORDER BY created_at DESC LIMIT 6').all();
  res.json({ totalUsers, totalListings, totalValue, recent });
});

// --- Users ---

router.get('/users', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT u.username, u.contact, u.bank,
      (SELECT COUNT(*) FROM listings l WHERE l.seller = u.username) as listingCount
    FROM users u ORDER BY u.created_at DESC
  `).all();
  res.json(rows);
});

router.delete('/users/:username', requireAdmin, (req, res) => {
  const username = req.params.username;
  const listingIds = db.prepare('SELECT id FROM listings WHERE seller = ?').all(username).map(r => r.id);
  const delNotices = db.prepare('DELETE FROM payment_notices WHERE listing_id = ?');
  const delChats = db.prepare('DELETE FROM listing_messages WHERE listing_id = ?');
  listingIds.forEach(id => { delNotices.run(id); delChats.run(id); });
  db.prepare('DELETE FROM listings WHERE seller = ?').run(username);
  db.prepare('DELETE FROM messages WHERE username = ?').run(username);
  db.prepare('DELETE FROM users WHERE username = ?').run(username);
  res.json({ ok: true });
});

// --- Listings ---

router.get('/listings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM listings ORDER BY created_at DESC').all();
  const withCounts = rows.map(l => ({
    ...l,
    paymentNoticeCount: db.prepare('SELECT COUNT(*) c FROM payment_notices WHERE listing_id = ?').get(l.id).c
  }));
  res.json(withCounts);
});

router.delete('/listings/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM payment_notices WHERE listing_id = ?').run(req.params.id);
  db.prepare('DELETE FROM listing_messages WHERE listing_id = ?').run(req.params.id);
  db.prepare('DELETE FROM listings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Payouts to sellers (manual — see routes/payments.js for why) ---
// A payment becomes "owed" once a buyer's PromptPay charge succeeds.
// The admin transfers that seller their share manually (bank app, etc.)
// and then marks it paid out here, purely for record-keeping.

router.get('/payouts', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, l.event, l.seller, u.bank as seller_bank, u.contact as seller_contact
    FROM payments p
    JOIN listings l ON l.id = p.listing_id
    LEFT JOIN users u ON u.username = l.seller
    WHERE p.payout_status != 'not_owed'
    ORDER BY p.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/payouts/:paymentId/mark-paid', requireAdmin, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.paymentId);
  if (!payment) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
  db.prepare("UPDATE payments SET payout_status = 'paid_out', payout_at = ? WHERE id = ?")
    .run(Date.now(), req.params.paymentId);
  res.json({ ok: true });
});

router.post('/payouts/:paymentId/mark-unpaid', requireAdmin, (req, res) => {
  db.prepare("UPDATE payments SET payout_status = 'owed', payout_at = NULL WHERE id = ?")
    .run(req.params.paymentId);
  res.json({ ok: true });
});

// --- Messages inbox ---

router.get('/messages', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT DISTINCT username FROM messages').all();
  const threads = rows.map(({ username }) => {
    const msgs = db.prepare('SELECT * FROM messages WHERE username = ? ORDER BY created_at ASC').all(username);
    const last = msgs[msgs.length - 1];
    const lastUser = Math.max(0, ...msgs.filter(m => m.sender === 'user').map(m => m.created_at));
    const lastAdmin = Math.max(0, ...msgs.filter(m => m.sender === 'admin').map(m => m.created_at));
    return { username, messages: msgs, last, unread: lastUser > lastAdmin };
  }).sort((a, b) => b.last.created_at - a.last.created_at);
  res.json(threads);
});

router.post('/messages/:username', requireAdmin, (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'พิมพ์ข้อความก่อนส่ง' });
  db.prepare(`
    INSERT INTO messages (id, username, sender, text, created_at) VALUES (?, ?, 'admin', ?, ?)
  `).run(newId(), req.params.username, text.trim(), Date.now());
  res.json({ ok: true });
});

module.exports = router;
