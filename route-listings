// routes/listings.js — browse/post/edit/delete ticket listings,
// and the manual "I've transferred payment" notice workflow.

const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const { requireAuth } = require('./mw-auth');

const router = express.Router();
const newId = () => crypto.randomBytes(8).toString('hex');

function attachSellerInfo(listing) {
  const seller = db.prepare('SELECT contact, bank FROM users WHERE username = ?').get(listing.seller);
  const notices = db.prepare('SELECT * FROM payment_notices WHERE listing_id = ? ORDER BY created_at ASC')
    .all(listing.id);
  return { ...listing, sellerBank: seller ? seller.bank : '', paymentNotices: notices };
}

// Public: browse all listings.
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM listings ORDER BY created_at DESC').all();
  res.json(rows.map(attachSellerInfo));
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
  db.prepare('DELETE FROM listings WHERE id = ?').run(req.params.id);
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

module.exports = router;
