// utils/password.js
// Small helper module for hashing/checking passwords with PBKDF2.
// Pulled out of server.js so config/db.js can use the exact same hashing
// when it seeds the first admin account — keeping one password format
// everywhere instead of two copies of this logic drifting apart.

const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, saved) {
  const [salt, originalHash] = String(saved || '').split(':');
  if (!salt || !originalHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

module.exports = { hashPassword, verifyPassword };
