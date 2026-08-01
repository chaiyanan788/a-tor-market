# ตั๋วต่อ — Ticket Resale Marketplace

A real backend + frontend for a concert/event ticket resale marketplace:
member accounts, listings, a manual payment-notice workflow, an admin
dashboard, and a support chat. This replaces the earlier Claude-artifact
demo (which used an in-browser storage API) with a real Node.js + SQLite
backend, so data actually persists and isn't tied to Claude's environment.

## What's included

```
ticket-market-pro/
├── server.js            entry point — serves the API and the frontend
├── db.js                SQLite schema and connection
├── mw-auth.js           JWT auth checks (user + admin)
├── route-auth.js        register / login / profile
├── route-listings.js    browse / post / edit / delete / payment notices
├── route-messages.js    user side of the support chat
├── route-admin.js       admin passcode, overview, users, listings, inbox
├── route-payments.js    real Omise PromptPay integration
├── web-index.html / web-app.js       the public site
├── web-admin.html / web-admin.js     the admin dashboard (at /admin)
├── web-styles.css        shared styling for both
├── .env.example
└── package.json
```

All files live at the top level (no subfolders) — this keeps uploading
everything to GitHub simple, since you can select every file at once in
one "Upload files" action instead of recreating a folder structure by hand.

## Running it locally

You'll need [Node.js](https://nodejs.org) 18 or newer installed.

```bash
cd ticket-market-pro
npm install
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to a long random string. You can generate
one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then start the server:

```bash
npm start
```

Visit **http://localhost:4000** for the site, and
**http://localhost:4000/admin** for the admin dashboard (it will ask you
to set an admin passcode the first time).

A file `ticket_market.db` (SQLite) will be created automatically on first
run — this holds all your data. Back it up like any other file.

## Deploying it for real

This is a normal Node.js app, so it runs on any host that supports Node —
for example [Render](https://render.com), [Railway](https://railway.app),
[Fly.io](https://fly.io), or your own VPS. Rough steps for most of these:

1. Push this folder to a GitHub repo (or upload it directly, depending on
   the host).
2. Create a new "Web Service" pointing at the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Set the `JWT_SECRET` environment variable in the host's dashboard —
   do **not** commit your real `.env` file to git (`.gitignore` already
   excludes it).
5. Make sure the host gives you persistent disk storage for
   `ticket_market.db` — some serverless/ephemeral hosts wipe the
   filesystem between deploys, which would lose your data. Render and
   Railway both support a persistent disk/volume; check your host's docs
   for how to mount one at the project folder.

Once deployed, sharing the site's real URL will show your own branding in
link previews (no more Anthropic-branded preview card), because it's now
your own domain instead of a shared claude.ai link.

## Security notes — read before going live

- PINs and the admin passcode are hashed with bcrypt before storage —
  never stored in plain text. Still, a 4–6 digit PIN is inherently weak;
  consider requiring a longer password if this becomes a real business.
- Login sessions are JWTs stored in the browser's `localStorage`. This is
  standard practice for a real site (unlike the earlier Claude-artifact
  version, which explicitly could not use `localStorage`).
- There is no rate-limiting, CAPTCHA, or account-lockout on login/register
  yet — add one (e.g. `express-rate-limit`) before opening this to the
  public, to slow down PIN-guessing attempts.
- CORS is currently wide open (`app.use(cors())`) for easy local testing.
  Before going live, restrict it to your real frontend's domain.
- Consider adding HTTPS (most hosts above provide this automatically) —
  never run login/PIN traffic over plain HTTP in production.

## About payments — now implemented (PromptPay via Omise)

Real payment collection is now wired up using **Omise (Opn Payments)**
PromptPay QR — the standard way Thai buyers pay for something like this.

**To turn it on:**
1. Sign up free at https://dashboard.omise.co/signup — **test-mode keys
   are issued immediately, no business registration needed** to try the
   full flow risk-free.
2. Copy your test `Public key` and `Secret key` from Dashboard → Keys into
   `.env` as `OMISE_PUBLIC_KEY` / `OMISE_SECRET_KEY`.
3. Restart the server. A "💳 จ่ายผ่าน PromptPay" button will now appear on
   listings automatically (it's hidden until keys are configured, so the
   site works fine without payments too).
4. In the Omise Dashboard, add a webhook pointing at
   `https://yourdomain.com/api/payments/webhook` so payment confirmations
   reach the server even if the buyer closes the tab after scanning.
5. Test with Omise's test-mode PromptPay flow (their dashboard/docs
   explain how test charges auto-confirm) before switching to live keys.

**What this does NOT do:** it collects money into *your* Omise account —
it does not automatically pay sellers. For a small marketplace, the
normal approach is to transfer each seller their share manually (bank
transfer) on a regular schedule, using the admin dashboard's listings/
payments data to know who's owed what. Automatic payouts to many sellers
require Omise's Recipients/Transfer API and additional KYC — a bigger,
separate project for later if this grows. See the comments at the top of
`routes/payments.js` for the technical detail.

The older manual "แจ้งโอนเงินแล้ว" (payment notice) flow still exists
alongside this, for buyers/sellers who prefer to arrange bank transfers
directly without going through PromptPay.

## Extending it further

Ideas if you keep building this:
- Email or LINE Notify integration for "your payment was confirmed" alerts.
- Real-time chat (Socket.io or Server-Sent Events) instead of the current
  refresh-to-see-new-messages model.
- Image uploads for tickets/proof-of-payment (e.g. via S3 or Cloudinary —
  don't store images directly in SQLite).
- Automated tests for the API routes before you rely on this for real
  transactions.
