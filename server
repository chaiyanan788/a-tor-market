// server.js — entry point. Serves the API and the static frontend
// from a single Node process, so deployment is just: npm install && npm start.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET in .env — copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./route-auth'));
app.use('/api/listings', require('./route-listings'));
app.use('/api/messages', require('./route-messages'));
app.use('/api/admin', require('./route-admin'));
app.use('/api/payments', require('./route-payments'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'web-index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'web-admin.html')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'web-styles.css')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'web-app.js')));
app.get('/admin.js', (req, res) => res.sendFile(path.join(__dirname, 'web-admin.js')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`ตั๋วต่อ server running at http://localhost:${PORT}`));
