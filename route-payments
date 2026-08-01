// routes/payments.js
//
// Real payment collection via Omise (Opn Payments), using PromptPay QR —
// the most common way Thai buyers pay for something like this, and it
// needs no card details from the buyer.
//
// IMPORTANT — what this does and doesn't cover:
//   - This collects money FROM the buyer INTO your own Omise account.
//   - It does NOT automatically pay the seller. For a real marketplace
//     you'd either (a) manually transfer sellers their share from your
//     Omise balance to their bank account, on your own schedule, or
//     (b) build on Omise's Recipients/Transfer API for automatic payouts
//     — that requires additional KYC with Omise and is a separate,
//     bigger integration than this file. Start with (a) manually while
//     you're small; it's completely normal for early-stage marketplaces.
//   - Get free TEST keys at https://dashboard.omise.co/signup (no business
//     registration needed for test mode) and put them in your .env as
//     OMISE_PUBLIC_KEY / OMISE_SECRET_KEY. Switch to live keys only once
//     you've registered a real business with Omise.
//   - Set up a webhook in the Omise dashboard pointing at
//     https://yourdomain.com/api/payments/webhook so charge status
//     updates reach this server (see the /webhook route below).

const express = require('express');
const crypto = require('crypto');
const { promisify } = require('util');
const omiseLib = require('omise');
const db = require('./db');
const { requireAuth } = require('./mw-auth');

const router = express.Router();
const newId = () => crypto.randomBytes(8).toString('hex');

const omise = omiseLib({
  publicKey: process.env.OMISE_PUBLIC_KEY,
  secretKey: process.env.OMISE_SECRET_KEY,
});

// omise-node's documented API is Node-style callbacks, e.g.
// omise.charges.create({...}, function (err, charge) {...}) — wrap with
// promisify so this file can use async/await reliably either way.
const createSource = promisify(omise.sources.create.bind(omise.sources));
const createCharge = promisify(omise.charges.create.bind(omise.charges));
const retrieveCharge = promisify(omise.charges.retrieve.bind(omise.charges));

function paymentsConfigured() {
  return !!(process.env.OMISE_PUBLIC_KEY && process.env.OMISE_SECRET_KEY
    && !process.env.OMISE_SECRET_KEY.includes('xxxxx'));
}

// Frontend calls this to know whether to show the "pay by PromptPay"
// button at all — lets the site work fine even before you've set up keys.
router.get('/config', (req, res) => {
  res.json({ enabled: paymentsConfigured() });
});

// Buyer taps "ชำระเงินผ่าน PromptPay" on a listing.
router.post('/create-charge', requireAuth, async (req, res) => {
  if (!paymentsConfigured()) {
    return res.status(501).json({ error: 'ยังไม่ได้ตั้งค่าคีย์ Omise ในไฟล์ .env — ดู routes/payments.js' });
  }
  const { listingId } = req.body || {};
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) return res.status(404).json({ error: 'ไม่พบประกาศนี้' });
  if (listing.status === 'sold') return res.status(409).json({ error: 'บัตรนี้ถูกขายไปแล้ว' });

  const amountSatang = Math.round(listing.price * listing.qty * 100); // Omise uses the smallest currency unit

  try {
    const source = await createSource({
      amount: amountSatang,
      currency: 'thb',
      type: 'promptpay',
    });
    const charge = await createCharge({
      amount: amountSatang,
      currency: 'thb',
      source: source.id,
    });

    const id = newId();
    db.prepare(`
      INSERT INTO payments (id, listing_id, charge_id, buyer, amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, listingId, charge.id, req.user.username, listing.price * listing.qty, Date.now());

    res.json({
      paymentId: id,
      chargeId: charge.id,
      qrImageUrl: charge.source.scannable_code.image.download_uri,
      amount: listing.price * listing.qty,
      expiresAt: charge.expires_at,
    });
  } catch (e) {
    console.error('Omise charge creation failed:', e);
    res.status(502).json({ error: 'สร้างรายการชำระเงินไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

// Frontend polls this after showing the QR, to find out when it's paid.
router.get('/status/:paymentId', requireAuth, async (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.paymentId);
  if (!payment) return res.status(404).json({ error: 'ไม่พบรายการชำระเงินนี้' });

  // Re-check with Omise directly rather than trusting only our local
  // status, in case the webhook hasn't arrived yet.
  if (payment.status === 'pending' && paymentsConfigured()) {
    try {
      const charge = await retrieveCharge(payment.charge_id);
      if (charge.status === 'successful' || charge.paid) {
        markPaymentPaid(payment);
        payment.status = 'paid';
      } else if (charge.status === 'failed' || charge.status === 'expired') {
        db.prepare("UPDATE payments SET status = 'failed' WHERE id = ?").run(payment.id);
        payment.status = 'failed';
      }
    } catch (e) { /* ignore transient lookup errors, frontend will retry */ }
  }
  res.json({ status: payment.status });
});

function markPaymentPaid(payment) {
  db.prepare("UPDATE payments SET status = 'paid' WHERE id = ?").run(payment.id);
  db.prepare("UPDATE listings SET status = 'sold' WHERE id = ?").run(payment.listing_id);
}

// Omise calls this automatically when a charge's status changes.
// Configure the URL in Dashboard > Webhooks as https://yourdomain.com/api/payments/webhook
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // acknowledge immediately; Omise retries if you don't

  if (!paymentsConfigured()) return;
  const event = req.body;
  if (!event || !event.data || !event.data.id) return;

  try {
    // Don't trust the webhook payload directly — re-fetch the charge
    // from Omise using our secret key so a forged webhook can't fake a payment.
    const charge = await retrieveCharge(event.data.id);
    const payment = db.prepare('SELECT * FROM payments WHERE charge_id = ?').get(charge.id);
    if (!payment) return;

    if ((charge.status === 'successful' || charge.paid) && payment.status !== 'paid') {
      markPaymentPaid(payment);
    } else if (charge.status === 'failed' || charge.status === 'expired') {
      db.prepare("UPDATE payments SET status = 'failed' WHERE id = ?").run(payment.id);
    }
  } catch (e) {
    console.error('Webhook processing failed:', e);
  }
});

module.exports = router;
