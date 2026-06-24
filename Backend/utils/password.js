'use strict';

const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(String(password)).digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  const actual = crypto.createHmac('sha256', salt).update(String(password)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
