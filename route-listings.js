// routes/listings.js — browse/post/edit/delete ticket listings,
// and the manual "I've transferred payment" notice workflow.

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { requireAuth } = require('./mw-auth');

const router = express.Router();
const newId = () => crypto.randomBytes(8).toString('hex');

// Doesn't require login, but reads req.user if a valid token is present —
// used so the public listings feed can flag "you need to confirm receipt"
// without forcing every visitor to be logged in.
function softAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch (e) { /* ignore */ }
  }
  next();
}

function attachSellerInfo(listing, viewerUsername) {
  const seller = db.prepare('SELECT contact, bank FROM users WHERE username = ?').get(listing.seller);
  const notices = db.prepare('SELECT * FROM payment_notices WHERE listing_id = ? ORDER BY created_at ASC')
    .all(listing.id);
  let needsReceiptConfirmation = false;
  if (viewerUsername) {
    const pending = db.prepare(`
      SELECT id FROM payments WHERE listing_id = ? AND buyer = ? AND payout_status = 'pending_confirmation'
    `).get(listing.id, viewerUsername);
    needsReceiptConfirmation = !!pending;
  }
  return { ...listing, sellerBank: seller ? seller.bank : '', paymentNotices: notices, needsReceiptConfirmation };
}

// Public: browse all listings (soft-auth so we can flag receipt confirmation).
router.get('/', softAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM listings ORDER BY created_at DESC').all();
  res.json(rows.map(l => attachSellerInfo(l, req.user && req.user.username)));
});

// Auth required: create a listing.
router.post('/', requireAuth, (req, res) => {
  const { event, date, section, venue, qty, price, originalPrice, description, contact } = req.body || {};
  if (!event || !venue || !contact || !qty || qty < 1 || price == null || price < 0) {
    return res.status(400).json({ error: 'กรอกข้อมูลให้ครบและถูกต้อง' });
  }
  const id = newId();
  db.prepare(`
    INSERT INTO listings (id, event, date, section, venue, qty, price, original_price, description, contact, seller, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)
  `).run(id, event, date || null, section || '', venue, qty, price, originalPrice || null, description || '', contact, req.user.username, Date.now());

  res.json(attachSellerInfo(db.prepare('SELECT * FROM listings WHERE id = ?').get(id)));
});

function loadOwned(req, res, next) {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'ไม่พบประกาศนี้' });
  if (listing.seller !== req.user.username) return res.status(403).json({ error: 'แก้ไขได้เฉพาะประกาศของตัวเอง' });
  req.listing = listing;
  next();
}

// Auth + ownership required: edit a listing (including status).
router.put('/:id', requireAuth, loadOwned, (req, res) => {
  const f = req.body || {};
  const merged = { ...req.listing, ...f };
  db.prepare(`
    UPDATE listings SET event=?, date=?, section=?, venue=?, qty=?, price=?, original_price=?,
      description=?, contact=?, status=? WHERE id=?
  `).run(
    merged.event, merged.date, merged.section, merged.venue, merged.qty, merged.price,
    merged.originalPrice ?? merged.original_price, merged.description, merged.contact,
    merged.status, req.params.id
  );
  res.json(attachSellerInfo(db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id)));
});

// Auth + ownership required: delete a listing.
router.delete('/:id', requireAuth, loadOwned, (req, res) => {
  db.prepare('DELETE FROM payment_notices WHERE listing_id = ?').run(req.params.id);
  db.prepare('DELETE FROM listing_messages WHERE listing_id = ?').run(req.params.id);
  db.prepare('DELETE FROM listings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Buyer <-> seller chat, scoped to one listing ---
// A listing can have several separate buyer threads; the seller sees all
// of them, each buyer only sees their own conversation with the seller.

// Buyer: get/send messages in their own thread for this listing.
router.get('/:id/chat/mine', requireAuth, (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'ไม่พบประกาศนี้' });
  if (listing.seller === req.user.username) {
    return res.status(400).json({ error: 'ผู้ขายต้องเลือกดูแชทของผู้ซื้อแต่ละคนแยกกัน' });
  }
  const rows = db.prepare(`
    SELECT * FROM listing_messages WHERE listing_id = ? AND buyer = ? ORDER BY created_at ASC
  `).all(req.params.id, req.user.username);
  res.json(rows);
});

router.post('/:id/chat/mine', requireAuth, (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'ไม่พบประกาศนี้' });
  if (listing.seller === req.user.username) {
    return res.status(400).json({ error: 'ผู้ขายต้องตอบผ่านหน้ารายชื่อผู้ซื้อ ไม่ใช่ช่องนี้' });
  }
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'พิมพ์ข้อความก่อนส่ง' });
  db.prepare(`
    INSERT INTO listing_messages (id, listing_id, buyer, sender, text, created_at)
    VALUES (?, ?, ?, 'buyer', ?, ?)
  `).run(newId(), req.params.id, req.user.username, text.trim(), Date.now());
  res.json({ ok: true });
});

// Seller: list every buyer thread for this listing.
router.get('/:id/chat/threads', requireAuth, loadOwned, (req, res) => {
  const buyers = db.prepare('SELECT DISTINCT buyer FROM listing_messages WHERE listing_id = ?').all(req.params.id);
  const threads = buyers.map(({ buyer }) => {
    const msgs = db.prepare(`
      SELECT * FROM listing_messages WHERE listing_id = ? AND buyer = ? ORDER BY created_at ASC
    `).all(req.params.id, buyer);
    return { buyer, messages: msgs, last: msgs[msgs.length - 1] };
  }).sort((a, b) => b.last.created_at - a.last.created_at);
  res.json(threads);
});

// Seller: reply to a specific buyer's thread for this listing.
router.post('/:id/chat/:buyer', requireAuth, loadOwned, (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'พิมพ์ข้อความก่อนส่ง' });
  db.prepare(`
    INSERT INTO listing_messages (id, listing_id, buyer, sender, text, created_at)
    VALUES (?, ?, ?, 'seller', ?, ?)
  `).run(newId(), req.params.id, req.params.buyer, text.trim(), Date.now());
  res.json({ ok: true });
});

// Auth required: buyer notifies the seller that they've sent payment.
// NOTE: this only records a note — no real money moves through this endpoint.
// See routes/payments.js for what a real payment-gateway integration needs.
router.post('/:id/payment-notice', requireAuth, (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'ไม่พบประกาศนี้' });
  const { amount, note } = req.body || {};
  if (!amount || amount <= 0) return res.status(400).json({ error: 'กรอกจำนวนเงินให้ถูกต้อง' });

  db.prepare(`
    INSERT INTO payment_notices (id, listing_id, amount, note, by_user, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(newId(), req.params.id, amount, note || '', req.user.username, Date.now());

  if (listing.status === 'available') {
    db.prepare('UPDATE listings SET status = ? WHERE id = ?').run('reserved', req.params.id);
  }
  res.json(attachSellerInfo(db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id)));
});

// Auth required: buyer confirms they received the ticket. Only this step
// makes the seller's payout eligible — see markPaymentPaid() in
// route-payments.js, which sets payout_status to 'pending_confirmation'
// rather than 'owed' right away.
router.post('/:id/confirm-received', requireAuth, (req, res) => {
  const payment = db.prepare(`
    SELECT * FROM payments WHERE listing_id = ? AND buyer = ? AND payout_status = 'pending_confirmation'
  `).get(req.params.id, req.user.username);
  if (!payment) return res.status(404).json({ error: 'ไม่พบรายการที่รอยืนยันสำหรับคุณ' });
  db.prepare("UPDATE payments SET payout_status = 'owed' WHERE id = ?").run(payment.id);
  res.json({ ok: true });
});

module.exports = router;
