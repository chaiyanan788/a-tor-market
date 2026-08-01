// middleware/auth.js — verifies JWTs issued at login/register.
// The token payload is either { username, role: 'user' } or { role: 'admin' }.

const jwt = require('jsonwebtoken');

function getToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' ? token : null;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'ไม่ได้เข้าสู่ระบบ' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

function requireAdmin(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'ไม่ได้เข้าสู่ระบบแอดมิน' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'ไม่มีสิทธิ์แอดมิน' });
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'เซสชันแอดมินหมดอายุ' });
  }
}

module.exports = { requireAuth, requireAdmin };
