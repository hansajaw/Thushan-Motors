require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const { initDatabase, getPool } = require('./config/db');
const { hashPassword, verifyPassword } = require('./utils/password');
// buy_price is stored in products table; used for net profit calculation in reports
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');

const app = express();

app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const ADMIN_KEY = process.env.ADMIN_KEY || 'dev_admin_key_change_me';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
// FIX: the HTML/CSS/JS files (index.html, admin.html, shop.html, etc.)
// live directly in the project's root folder (one level above Backend),
// NOT inside a separate "frontend" subfolder. The old path was pointing
// at a folder that doesn't exist, so the site could never be served by
// this same server. This line fixes that.
const FRONTEND_DIR = path.join(__dirname, '..');

app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',

  // Old Vercel frontend domains
  'https://thushan-motors-3iqp.vercel.app',
  'https://thushan-motors.vercel.app',

  // New custom domain
  'https://thushanmotors.lk',
  'https://www.thushanmotors.lk'
];
app.use(cors({
  origin: function(origin, callback){
    if(!origin || allowedOrigins.includes(origin)){
      return callback(null, true);
    }

    return callback(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key']
}));
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 250 }));
app.use(express.static(FRONTEND_DIR));

function now() {
  return new Date().toISOString();
}

// Wraps async route handlers so thrown errors reach the error middleware
function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signToken(payload, expiresInSeconds = 60 * 60 * 24 * 7) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const unsigned = `${header}.${payload}`;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

function validateEmail(email) {
  return /^\S+@\S+\.\S+$/.test(String(email || '').trim());
}

function orderNumber(id) {
  return `TM-${String(id).padStart(5, '0')}`;
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtpEmail(email, otp) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`OTP for ${email}: ${otp}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Verify your Thushan Motors account',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2>Thushan Motors Email Verification</h2>
        <p>Your OTP verification code is:</p>
        <h1 style="letter-spacing:6px;color:#CC1111">${otp}</h1>
        <p>This code will expire in 10 minutes.</p>
        <p>If you did not create this account, please ignore this email.</p>
      </div>
    `
  });
}

// ---------- Row -> JSON mappers (DB uses snake_case, API stays camelCase) ----------

function cleanUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    role: row.role || 'customer',
    createdAt: row.created_at
  };
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    price: Number(row.price),
    oldPrice: row.old_price !== null && row.old_price !== undefined ? Number(row.old_price) : null,
    buyPrice: row.buy_price !== null && row.buy_price !== undefined ? Number(row.buy_price) : null,
    stock: !!row.stock,
    featured: !!row.featured,
    img: row.img,
    freeDelivery: !!row.free_delivery,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOrderItem(row) {
  return {
    productId: row.product_id,
    name: row.name,
    price: Number(row.price),
    quantity: row.quantity,
    subtotal: Number(row.subtotal)
  };
}

function mapOrder(row, items, customer) {
  return {
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    customer: customer || null,
    items,
    subtotal: Number(row.subtotal || row.total),
    discount: Number(row.discount || 0),
    total: Number(row.total),
    delivery: {
      name: row.delivery_name,
      phone: row.delivery_phone,
      address: row.delivery_address,
      district: row.delivery_district,
      notes: row.delivery_notes || ''
    },
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    email: row.email || '',
    message: row.message,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapReview(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location || '',
    rating: Number(row.rating),
    message: row.message,
    tag: row.tag || 'Customer Feedback',
    createdAt: row.created_at
  };
}

// ---------- Auth middleware ----------

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ message: 'Login required.' });

    const [rows] = await getPool().query('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    if (!rows.length) return res.status(401).json({ message: 'Account not found.' });
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

// Admin access now has two doors:
//   1. A real admin ACCOUNT — logged in through the normal /api/auth/login
//      endpoint, same as any customer, just with role = 'admin' in the
//      users table. This is the one admin.html uses now.
//   2. The old static ADMIN_KEY header — kept working so existing scripts
//      or a quick curl command from the server itself still get in even
//      if the database is briefly unreachable.
const requireAdmin = asyncHandler(async (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (key && key === ADMIN_KEY) return next();

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const decoded = token ? verifyToken(token) : null;

  if (decoded) {
    const [rows] = await getPool().query('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    const user = rows[0];
    if (user && user.role === 'admin') {
      req.user = user;
      return next();
    }
  }

  return res.status(403).json({ message: 'Admin access denied.' });
});

// ---------- Routes ----------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Thushan Motors API running', time: now() });
});

app.get('/api/products', asyncHandler(async (req, res) => {
  const { q = '', category = 'all', brand = 'all', maxPrice, inStock, sort = 'featured' } = req.query;

  const conditions = [];
  const params = [];

  if (q) {
    conditions.push('(LOWER(name) LIKE ? OR LOWER(IFNULL(brand, "")) LIKE ?)');
    const like = `%${String(q).toLowerCase()}%`;
    params.push(like, like);
  }
  if (category !== 'all') {
    conditions.push('category = ?');
    params.push(category);
  }
  if (brand !== 'all') {
    conditions.push('brand = ?');
    params.push(brand);
  }
  if (maxPrice) {
    conditions.push('price <= ?');
    params.push(Number(maxPrice));
  }
  if (inStock === 'true') {
    conditions.push('stock = 1');
  }

  let sql = 'SELECT * FROM products';
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');

  if (sort === 'price-asc') sql += ' ORDER BY price ASC';
  else if (sort === 'price-desc') sql += ' ORDER BY price DESC';
  else if (sort === 'name') sql += ' ORDER BY name ASC';
  else sql += ' ORDER BY featured DESC, id ASC';

  const [rows] = await getPool().query(sql, params);
  res.json(rows.map(mapProduct));
}));

app.get('/api/products/:id', asyncHandler(async (req, res) => {
  const [rows] = await getPool().query('SELECT * FROM products WHERE id = ?', [Number(req.params.id)]);
  if (!rows.length) return res.status(404).json({ message: 'Product not found.' });
  res.json(mapProduct(rows[0]));
}));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { name, email, phone = '', password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const pool = getPool();
  const cleanEmail = String(email).trim().toLowerCase();

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);

  if (existing.length) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const passwordHash = hashPassword(password);

  await pool.query(
    `INSERT INTO users
      (name, email, phone, password_hash, role, email_verified, email_otp_hash, email_otp_expires_at, email_otp_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(name).trim(),
      cleanEmail,
      String(phone).trim(),
      passwordHash,
      'customer',
      0,
      otpHash,
      otpExpiresAt,
      0
    ]
  );

  await sendOtpEmail(cleanEmail, otp);

  res.status(201).json({
    message: 'Account created. Please verify your email using the OTP we sent.',
    needsVerification: true,
    email: cleanEmail
  });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  const [rows] = await getPool().query(
    'SELECT * FROM users WHERE email = ?',
    [cleanEmail]
  );

  const user = rows[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  if (user.role !== 'admin' && !user.email_verified) {
    return res.status(403).json({
      message: 'Please verify your email before logging in.',
      needsVerification: true,
      email: user.email
    });
  }

  const token = signToken({ userId: user.id, role: user.role });

  res.json({ token, user: cleanUser(user) });
}));

app.post('/api/auth/verify-email', asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanOtp = String(otp).trim();
  const pool = getPool();

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
  const user = rows[0];

  if (!user) {
    return res.status(404).json({ message: 'Account not found.' });
  }

  if (user.email_verified) {
    const token = signToken({ userId: user.id, role: user.role });
    return res.json({
      token,
      user: cleanUser(user),
      message: 'Email already verified.'
    });
  }

  if (!user.email_otp_hash || !user.email_otp_expires_at) {
    return res.status(400).json({ message: 'No OTP found. Please request a new code.' });
  }

  if (new Date(user.email_otp_expires_at).getTime() < Date.now()) {
    return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
  }

  if (Number(user.email_otp_attempts || 0) >= 5) {
    return res.status(429).json({ message: 'Too many wrong attempts. Please request a new OTP.' });
  }

  const otpHash = hashOtp(cleanOtp);

  if (otpHash !== user.email_otp_hash) {
    await pool.query(
      'UPDATE users SET email_otp_attempts = email_otp_attempts + 1 WHERE id = ?',
      [user.id]
    );

    return res.status(400).json({ message: 'Invalid OTP.' });
  }

  await pool.query(
    `UPDATE users
     SET email_verified = 1,
         email_otp_hash = NULL,
         email_otp_expires_at = NULL,
         email_otp_attempts = 0
     WHERE id = ?`,
    [user.id]
  );

  const [updatedRows] = await pool.query('SELECT * FROM users WHERE id = ?', [user.id]);
  const updatedUser = updatedRows[0];

  const token = signToken({ userId: updatedUser.id, role: updatedUser.role });

  res.json({
    token,
    user: cleanUser(updatedUser),
    message: 'Email verified successfully.'
  });
}));

app.post('/api/auth/resend-otp', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const pool = getPool();

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
  const user = rows[0];

  if (!user) {
    return res.status(404).json({ message: 'Account not found.' });
  }

  if (user.email_verified) {
    return res.json({ message: 'Email is already verified.' });
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    `UPDATE users
     SET email_otp_hash = ?,
         email_otp_expires_at = ?,
         email_otp_attempts = 0
     WHERE id = ?`,
    [otpHash, otpExpiresAt, user.id]
  );

  await sendOtpEmail(cleanEmail, otp);

  res.json({ message: 'New OTP sent to your email.' });
}));

app.post('/api/auth/google', asyncHandler(async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ message: 'Google credential is required.' });
  }

  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ message: 'Google login is not configured.' });
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.sub || !payload.email) {
    return res.status(401).json({ message: 'Invalid Google account.' });
  }

  if (payload.email_verified === false) {
    return res.status(401).json({ message: 'Google email is not verified.' });
  }

  const googleId = payload.sub;
  const email = String(payload.email).trim().toLowerCase();
  const name = payload.name || email.split('@')[0];

  const pool = getPool();

  let [rows] = await pool.query(
    'SELECT * FROM users WHERE google_id = ? OR email = ? LIMIT 1',
    [googleId, email]
  );

  let user = rows[0];

  if (!user) {
    const randomPassword = crypto.randomBytes(20).toString('hex');
    const passwordHash = hashPassword(randomPassword);

    const [result] = await pool.query(
      `INSERT INTO users
        (name, email, phone, password_hash, role, google_id, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        '',
        passwordHash,
        'customer',
        googleId,
        1
      ]
    );

    const [newRows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    user = newRows[0];
  } else {
    if (!user.google_id || !user.email_verified) {
      await pool.query(
        'UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?',
        [googleId, user.id]
      );

      const [updatedRows] = await pool.query('SELECT * FROM users WHERE id = ?', [user.id]);
      user = updatedRows[0];
    }
  }

  const token = signToken({ userId: user.id, role: user.role });

  res.json({
    token,
    user: cleanUser(user),
    message: 'Google login successful.'
  });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: cleanUser(req.user) });
});

app.post('/api/orders', requireAuth, asyncHandler(async (req, res) => {
  const {
    customerName,
    customerPhone,
    deliveryName,
    deliveryPhone,
    deliveryAddress,
    deliveryDistrict,
    deliveryNotes,
    paymentMethod = 'cash_on_delivery',
    items = [],
    subtotal,
    discount = 0,
    total
  } = req.body;

  const finalDeliveryName = String(deliveryName || customerName || req.user.name || '').trim();
  const finalDeliveryPhone = String(deliveryPhone || customerPhone || req.user.phone || '').trim();
  const finalDeliveryAddress = String(deliveryAddress || '').trim();
  const finalDeliveryDistrict = String(deliveryDistrict || 'Not specified').trim();
  const finalDeliveryNotes = String(deliveryNotes || '').trim();

  if (!finalDeliveryName || !finalDeliveryPhone || !finalDeliveryAddress) {
    return res.status(400).json({
      message: 'Name, phone number and delivery address are required.'
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: 'Order must contain at least one product.'
    });
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const orderItems = [];
    let calculatedSubtotal = 0;

    for (const line of items) {
      const productId = Number(line.productId || line.id);
      const quantity = Math.max(1, Number(line.quantity || line.qty || 1));

      if (!productId) {
        await connection.rollback();
        return res.status(400).json({ message: 'Invalid product in cart.' });
      }

      const [productRows] = await connection.query(
        'SELECT * FROM products WHERE id = ? FOR UPDATE',
        [productId]
      );

      const product = productRows[0];

      if (!product) {
        await connection.rollback();
        return res.status(400).json({ message: `Product ${productId} not found.` });
      }

      if (!product.stock) {
        await connection.rollback();
        return res.status(400).json({ message: `${product.name} is out of stock.` });
      }

      const price = Number(product.price);
      const lineSubtotal = price * quantity;

      calculatedSubtotal += lineSubtotal;

      orderItems.push({
        productId: product.id,
        name: product.name,
        price,
        quantity,
        subtotal: lineSubtotal
      });
    }

    const finalSubtotal = Number(subtotal || calculatedSubtotal);
    const finalDiscount = Number(discount || 0);
    const finalTotal = Number(total || finalSubtotal - finalDiscount);

    const tempOrderNo = `T${Date.now().toString().slice(-12)}`;

    const [orderResult] = await connection.query(
      `INSERT INTO orders
        (
          order_no,
          user_id,
          subtotal,
          discount,
          total,
          delivery_name,
          delivery_phone,
          delivery_address,
          delivery_district,
          delivery_notes,
          payment_method,
          payment_status,
          status
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tempOrderNo,
        req.user.id,
        finalSubtotal,
        finalDiscount,
        finalTotal,
        finalDeliveryName,
        finalDeliveryPhone,
        finalDeliveryAddress,
        finalDeliveryDistrict,
        finalDeliveryNotes,
        paymentMethod,
        'pending',
        'pending'
      ]
    );

    const orderId = orderResult.insertId;
    const finalOrderNo = orderNumber(orderId);

    await connection.query(
      'UPDATE orders SET order_no = ? WHERE id = ?',
      [finalOrderNo, orderId]
    );

    for (const item of orderItems) {
      await connection.query(
        `INSERT INTO order_items
          (
            order_id,
            product_id,
            name,
            price,
            quantity,
            subtotal
          )
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.productId,
          item.name,
          item.price,
          item.quantity,
          item.subtotal
        ]
      );
    }

    await connection.commit();

    res.status(201).json({
      message: 'Order saved successfully.',
      order: {
        id: orderId,
        orderNo: finalOrderNo,
        customerName: finalDeliveryName,
        customerPhone: finalDeliveryPhone,
        deliveryAddress: finalDeliveryAddress,
        deliveryDistrict: finalDeliveryDistrict,
        deliveryNotes: finalDeliveryNotes,
        paymentMethod,
        subtotal: finalSubtotal,
        discount: finalDiscount,
        total: finalTotal,
        status: 'pending',
        items: orderItems
      }
    });
  } catch (err) {
    await connection.rollback();
    console.error('Order save error:', err);
    res.status(500).json({
      message: 'Could not save order.',
    });
  } finally {
    connection.release();
  }
}));

app.get('/api/orders/my', requireAuth, asyncHandler(async (req, res) => {
  const pool = getPool();
  const [orders] = await pool.query('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  if (!orders.length) return res.json([]);

  const orderIds = orders.map(o => o.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const [items] = await pool.query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);

  const itemsByOrder = {};
  for (const item of items) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  }

  const customer = cleanUser(req.user);
  res.json(orders.map(o => mapOrder(o, (itemsByOrder[o.id] || []).map(mapOrderItem), customer)));
}));

app.post('/api/contact', asyncHandler(async (req, res) => {
  const { name, phone, email, message } = req.body;
  if (!name || !message) return res.status(400).json({ message: 'Name and message are required.' });
  if (email && !validateEmail(email)) return res.status(400).json({ message: 'Please enter a valid email address.' });

  const pool = getPool();
  const [result] = await pool.query(
    'INSERT INTO messages (name, phone, email, message, status) VALUES (?, ?, ?, ?, ?)',
    [String(name).trim(), String(phone || '').trim(), String(email || '').trim().toLowerCase(), String(message).trim(), 'new']
  );

  const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [result.insertId]);
  res.status(201).json({ message: 'Message saved successfully.', data: mapMessage(rows[0]) });
}));

app.get('/api/reviews', asyncHandler(async (req, res) => {
  const [rows] = await getPool().query(
    `SELECT *
     FROM reviews
     WHERE approved = 1
     ORDER BY id DESC
     LIMIT 12`
  );

  res.json(rows.map(mapReview));
}));

app.get('/api/reviews/summary', asyncHandler(async (req, res) => {
  const [rows] = await getPool().query(
    `SELECT
       COUNT(*) AS review_count,
       COALESCE(AVG(rating), 0) AS average_rating
     FROM reviews
     WHERE approved = 1`
  );

  const summary = rows[0] || {};

  res.json({
    count: Number(summary.review_count || 0),
    average: Number(summary.average_rating || 0).toFixed(1)
  });
}));

app.post('/api/reviews', requireAuth, asyncHandler(async (req, res) => {
  const { rating, message, location = '', tag = 'Customer Feedback' } = req.body;

  const finalRating = Number(rating);
  const finalMessage = String(message || '').trim();
  const finalLocation = String(location || '').trim();
  const finalTag = String(tag || 'Customer Feedback').trim();

  if (!finalRating || finalRating < 1 || finalRating > 5) {
    return res.status(400).json({ message: 'Please select a rating between 1 and 5.' });
  }

  if (finalMessage.length < 10) {
    return res.status(400).json({ message: 'Review must be at least 10 characters.' });
  }

  if (finalMessage.length > 500) {
    return res.status(400).json({ message: 'Review must be less than 500 characters.' });
  }

  const pool = getPool();

  const [recentRows] = await pool.query(
    `SELECT id
     FROM reviews
     WHERE user_id = ?
       AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
     LIMIT 1`,
    [req.user.id]
  );

  if (recentRows.length) {
    return res.status(429).json({ message: 'You can add only one review per day.' });
  }

  const [result] = await pool.query(
    `INSERT INTO reviews
      (user_id, name, location, rating, message, tag, approved)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      req.user.name,
      finalLocation,
      finalRating,
      finalMessage,
      finalTag,
      1
    ]
  );

  const [rows] = await pool.query('SELECT * FROM reviews WHERE id = ?', [result.insertId]);

  res.status(201).json({
    message: 'Thank you! Your review has been added.',
    review: mapReview(rows[0])
  });
}));

/*
  GET /api/admin/customers — POS/Customers page eka real database eken
  customer list eka ganna use karanawa. Mehe witharak nemei, hama
  customer kenekuge order count eka + total spend eka ekath calculate
  karala return karanawa (SQL JOIN + GROUP BY use karala), Sales page
  eke "Top customers" wage features walata use karanna puluwan.
*/
app.get('/api/admin/customers', requireAdmin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT
      u.id, u.name, u.email, u.phone, u.created_at,
      COUNT(o.id) AS order_count,
      COALESCE(SUM(o.total), 0) AS total_spent
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    WHERE u.role = 'customer'
    GROUP BY u.id
    ORDER BY u.id DESC
  `);
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone || '',
    createdAt: r.created_at,
    orderCount: Number(r.order_count),
    totalSpent: Number(r.total_spent)
  })));
}));

/*
  POST /api/admin/customers — POS eke "walk-in" customer kenek (shop ekata
  ඇවිදින් එන, account ekak nathi customer kenek) quickly add karanna.
  Password ekak danna ona na (admin eken witharak add karana nisa),
  ehema nisa random password ekak generate karala hash karala save
  karanawa — me customer ta login wenna ona unoth password reset
  karanna ona wei (eka ekak wenas).
*/
app.post('/api/admin/customers', requireAdmin, asyncHandler(async (req, res) => {
  const { name, phone = '', email } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ message: 'Customer name is required.' });

  // Email ekak dunne nattam, walk-in customer ekata auto-generate karapu
  // unique email ekak danawa (database eke email column UNIQUE nisa)
  const finalEmail = (email && String(email).trim())
    ? String(email).trim().toLowerCase()
    : `walkin_${Date.now()}@thushanmotors.local`;

  if (email && !validateEmail(finalEmail)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  // Random password ekak hadala hash karanawa (me customer ta login
  // karanna ona unoth, "Forgot Password" use karanna ona)
  const randomPassword = crypto.randomBytes(12).toString('hex');
  const passwordHash = hashPassword(randomPassword);

  const pool = getPool();
  try {
    const [result] = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'customer')`,
      [String(name).trim(), finalEmail, String(phone).trim(), passwordHash]
    );
    res.status(201).json({
      id: result.insertId,
      name: String(name).trim(),
      email: finalEmail,
      phone: String(phone).trim(),
      orderCount: 0,
      totalSpent: 0
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A customer with this email already exists.' });
    }
    throw err;
  }
}));

/*
  POST /api/admin/orders — POS eke "Complete Sale" button eka click
  karaddi me endpoint eka call wenawa. Customer eke checkout eken yana
  /api/orders eka wage ekama logic ekak use karanawa (stock check,
  total calculate, order + order_items rows danawa) — wenasa thiyenne
  me eka admin kenek directly create karana eka (login wela inna
  customer kenek nathuwa), ehema nisa requireAdmin use karanawa,
  requireAuth eka wenuwata.
*/
app.post('/api/admin/orders', requireAdmin, asyncHandler(async (req, res) => {
  const { customerId, items = [], paymentMethod = 'cash_on_delivery', discount = 0 } = req.body;

  if (!customerId) return res.status(400).json({ message: 'Please select a customer for this sale.' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Add at least one item to the cart.' });
  }

  const pool = getPool();

  // Customer eka real database eke thiyenawada balanawa
  const [customerRows] = await pool.query('SELECT * FROM users WHERE id = ?', [Number(customerId)]);
  const customer = customerRows[0];
  if (!customer) return res.status(404).json({ message: 'Customer not found.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const orderItems = [];
    let total = 0;

    // Cart eke thiyena item ekak ekak gena, stock eka check karala,
    // (FOR UPDATE eken locking karanawa, ekama wele dewala order karaddi
    // stock eka wenas wena eka prevent karanna)
    for (const line of items) {
      const productId = Number(line.productId || line.id);
      const quantity = Math.max(1, Number(line.quantity || line.qty || 1));

      const [productRows] = await connection.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [productId]);
      const product = productRows[0];

      if (!product) {
        await connection.rollback();
        return res.status(400).json({ message: `Product ${productId} not found.` });
      }
      if (!product.stock) {
        await connection.rollback();
        return res.status(400).json({ message: `${product.name} is out of stock.` });
      }

      const price = Number(product.price);
      const subtotal = price * quantity;
      total += subtotal;
      orderItems.push({ productId: product.id, name: product.name, price, quantity, subtotal });
    }

    // POS sale eka shop ekenma counter eke karana eka nisa, delivery
    // details walata customer ge details ම (or "In-store pickup")
    // danawa — counter sale ekakata delivery address ekak ona na.
    const discountAmt = Math.min(Math.max(Number(discount) || 0, 0), total);
    const finalTotal = parseFloat((total - discountAmt).toFixed(2));

    const [orderResult] = await connection.query(
      `INSERT INTO orders
        (order_no, user_id, subtotal, discount, total, delivery_name, delivery_phone, delivery_address, delivery_district, delivery_notes, payment_method, payment_status, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        '',
        customer.id,
        total,
        discountAmt,
        finalTotal,
        customer.name,
        customer.phone || 'N/A',
        'In-store / POS sale',
        'Showroom',
        'Created from Admin POS',
        paymentMethod,
        'paid',
        'delivered'
      ]
    );

    const orderId = orderResult.insertId;
    const orderNo = orderNumber(orderId);
    await connection.query('UPDATE orders SET order_no = ? WHERE id = ?', [orderNo, orderId]);

    for (const item of orderItems) {
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, item.productId, item.name, item.price, item.quantity, item.subtotal]
      );
    }

    await connection.commit();

    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    res.status(201).json(mapOrder(orderRows[0], orderItems, cleanUser(customer)));
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}));

// GET /api/admin/customers/:id/orders — customer kenekage order history
app.get('/api/admin/customers/:id/orders', requireAdmin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const userId = Number(req.params.id);
  const [orders] = await pool.query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
     FROM orders o JOIN users u ON u.id = o.user_id
     WHERE o.user_id = ?
     ORDER BY o.id DESC`, [userId]
  );
  if (!orders.length) return res.json([]);
  const orderIds = orders.map(o => o.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const [items] = await pool.query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
  const itemsByOrder = {};
  for (const item of items) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  }
  res.json(orders.map(o => mapOrder(
    o,
    (itemsByOrder[o.id] || []).map(mapOrderItem),
    { id: o.user_id, name: o.customer_name, email: o.customer_email, phone: o.customer_phone || '' }
  )));
}));

app.get('/api/admin/orders', requireAdmin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const [orders] = await pool.query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
     FROM orders o JOIN users u ON u.id = o.user_id
     ORDER BY o.id DESC`
  );
  if (!orders.length) return res.json([]);

  const orderIds = orders.map(o => o.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const [items] = await pool.query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);

  const itemsByOrder = {};
  for (const item of items) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  }

  res.json(orders.map(o => mapOrder(
    o,
    (itemsByOrder[o.id] || []).map(mapOrderItem),
    { id: o.user_id, name: o.customer_name, email: o.customer_email, phone: o.customer_phone || '' }
  )));
}));

app.patch('/api/admin/orders/:id/status', requireAdmin, asyncHandler(async (req, res) => {
  const allowed = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
  const { status } = req.body;
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid order status.' });

  const pool = getPool();
  const id = Number(req.params.id);
  const [result] = await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Order not found.' });

  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
  res.json(mapOrder(rows[0], items.map(mapOrderItem)));
}));

app.get('/api/admin/messages', requireAdmin, asyncHandler(async (req, res) => {
  const [rows] = await getPool().query('SELECT * FROM messages ORDER BY id DESC');
  res.json(rows.map(mapMessage));
}));

app.delete('/api/admin/messages/:id', requireAdmin, asyncHandler(async (req, res) => {
  const [result] = await getPool().query('DELETE FROM messages WHERE id = ?', [Number(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Message not found.' });
  res.json({ message: 'Message deleted.' });
}));

// ─── ADMIN: CUSTOMERS list (with order stats) ─────────────────────────────────
app.get('/api/admin/customers', requireAdmin, asyncHandler(async (req, res) => {
  const [rows] = await getPool().query(
    `SELECT u.id, u.name, u.email, u.phone, u.email_verified, u.created_at,
            COUNT(o.id) AS order_count, COALESCE(SUM(o.total),0) AS total_spent
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     WHERE u.role = 'customer'
     GROUP BY u.id ORDER BY u.id DESC`
  );
  res.json(rows.map(r => ({
    id: r.id, name: r.name, email: r.email, phone: r.phone || '',
    emailVerified: !!r.email_verified, createdAt: r.created_at,
    orderCount: Number(r.order_count), totalSpent: Number(r.total_spent)
  })));
}));

app.post('/api/admin/products', requireAdmin, asyncHandler(async (req, res) => {
  const { name, brand = null, category, price, oldPrice = null, buyPrice = null, quantity = 0, stock = true, featured = false, img = '', freeDelivery = false } = req.body;
  if (!name || !category || price === undefined) return res.status(400).json({ message: 'Name, category, and price are required.' });

  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO products (name, brand, category, price, old_price, buy_price, quantity, stock, featured, img, free_delivery)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(name).trim(),
      brand || null,
      category,
      Number(price),
      oldPrice === '' || oldPrice === null ? null : Number(oldPrice),
      buyPrice === '' || buyPrice === null ? null : Number(buyPrice),
      Math.max(0, Number(quantity) || 0),
      stock ? 1 : 0,
      featured ? 1 : 0,
      img,
      freeDelivery ? 1 : 0
    ]
  );

  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
  res.status(201).json(mapProduct(rows[0]));
}));

app.patch('/api/admin/products/:id', requireAdmin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const id = Number(req.params.id);

  const [existingRows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  if (!existingRows.length) return res.status(404).json({ message: 'Product not found.' });

  const fieldMap = {
    name: 'name',
    brand: 'brand',
    category: 'category',
    price: 'price',
    oldPrice: 'old_price',
    buyPrice: 'buy_price',
    quantity: 'quantity',
    stock: 'stock',
    featured: 'featured',
    img: 'img',
    freeDelivery: 'free_delivery'
  };

  const setClauses = [];
  const params = [];

  for (const [bodyKey, column] of Object.entries(fieldMap)) {
    if (Object.prototype.hasOwnProperty.call(req.body, bodyKey)) {
      let value = req.body[bodyKey];
      if (bodyKey === 'price') value = Number(value);
      if (bodyKey === 'oldPrice') value = value === '' || value === null ? null : Number(value);
      if (bodyKey === 'buyPrice') value = value === '' || value === null ? null : Number(value);
      if (bodyKey === 'quantity') value = Math.max(0, Number(value) || 0);
      if (bodyKey === 'stock' || bodyKey === 'featured' || bodyKey === 'freeDelivery') value = value ? 1 : 0;
      setClauses.push(`${column} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length) {
    params.push(id);
    await pool.query(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`, params);
  }

  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  res.json(mapProduct(rows[0]));
}));

app.delete('/api/admin/products/:id', requireAdmin, asyncHandler(async (req, res) => {
  const [result] = await getPool().query('DELETE FROM products WHERE id = ?', [Number(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Product not found.' });
  res.json({ message: 'Product deleted.' });
}));

// ─── ADMIN: SALES (orders alias — admin panel calls /api/admin/sales) ─────────
app.get('/api/admin/sales', requireAdmin, asyncHandler(async (req, res) => {
  const pool = getPool();
  const [orders] = await pool.query(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
     FROM orders o JOIN users u ON u.id = o.user_id
     ORDER BY o.id DESC`
  );
  if (!orders.length) return res.json([]);

  const orderIds = orders.map(o => o.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const [items] = await pool.query(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);

  const itemsByOrder = {};
  for (const item of items) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  }

  res.json(orders.map(o => {
    const orderItems = (itemsByOrder[o.id] || []).map(i => ({
      productId: i.product_id,
      name: i.name,
      price: Number(i.price),
      quantity: Number(i.quantity || i.qty || 1),
      subtotal: Number(i.subtotal || 0)
    }));
    const totalQty = orderItems.reduce((s, i) => s + i.quantity, 0);
      return {
        id: o.id,
        orderNumber: o.order_no || `TM-${String(o.id).padStart(5, '0')}`,
        customerName: o.delivery_name || o.customer_name,
        customerEmail: o.customer_email,
        customerPhone: o.delivery_phone || o.customer_phone || '',

        deliveryName: o.delivery_name || '',
        deliveryPhone: o.delivery_phone || '',
        deliveryAddress: o.delivery_address || '',
        deliveryDistrict: o.delivery_district || '',
        deliveryNotes: o.delivery_notes || '',

        status: o.status,
        subtotal: Number(o.subtotal || o.total),
        discount: Number(o.discount || 0),
        total: Number(o.total),
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        createdAt: o.created_at,
        itemsCount: totalQty,
        items: orderItems
      };
  }));
}));

// ─── ADMIN: REPORTS (net profit, revenue breakdown) ──────────────────────────
app.get('/api/admin/reports', requireAdmin, asyncHandler(async (req, res) => {
  const pool = getPool();

  // Revenue from orders
  const [revenueRows] = await pool.query(
    `SELECT COALESCE(SUM(o.total),0) AS gross_revenue,
            COALESCE(SUM(o.discount),0) AS total_discounts,
            COUNT(o.id) AS order_count
     FROM orders o WHERE o.status != 'cancelled'`
  );

  // Cost (buy_price * quantity) for all sold items
  const [costRows] = await pool.query(
    `SELECT COALESCE(SUM(oi.quantity * COALESCE(p.buy_price, 0)), 0) AS total_cost
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     WHERE o.status != 'cancelled'`
  );

  // Monthly revenue (last 6 months)
  const [monthlyRows] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
            COALESCE(SUM(total),0) AS revenue,
            COUNT(*) AS orders
     FROM orders
     WHERE status != 'cancelled' AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
     GROUP BY month ORDER BY month ASC`
  );

  // Top products by revenue
  const [topProducts] = await pool.query(
    `SELECT p.name, p.brand, SUM(oi.quantity) AS units_sold,
            SUM(oi.subtotal) AS revenue,
            SUM(oi.quantity * COALESCE(p.buy_price,0)) AS cost
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     WHERE o.status != 'cancelled'
     GROUP BY oi.product_id, p.name, p.brand
     ORDER BY revenue DESC LIMIT 5`
  );

  const gross = Number(revenueRows[0].gross_revenue);
  const cost = Number(costRows[0].total_cost);
  const discounts = Number(revenueRows[0].total_discounts);
  const netProfit = gross - cost;

  res.json({
    grossRevenue: gross,
    totalCost: cost,
    totalDiscounts: discounts,
    netProfit,
    orderCount: Number(revenueRows[0].order_count),
    monthly: monthlyRows,
    topProducts: topProducts.map(p => ({
      name: p.name,
      brand: p.brand || 'Generic',
      unitsSold: Number(p.units_sold),
      revenue: Number(p.revenue),
      cost: Number(p.cost),
      profit: Number(p.revenue) - Number(p.cost)
    }))
  });
}));

// ─── ADMIN: USERS ─────────────────────────────────────────────────────────────
app.get('/api/admin/users', requireAdmin, asyncHandler(async (req, res) => {
  const [rows] = await getPool().query(
    `SELECT id, name, email, phone, role, email_verified, created_at FROM users ORDER BY id DESC`
  );
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone || '',
    role: r.role,
    emailVerified: !!r.email_verified,
    createdAt: r.created_at
  })));
}));

app.post('/api/admin/users', requireAdmin, asyncHandler(async (req, res) => {
  const { name, email, phone = '', role = 'customer', password } = req.body;
  if (!name || !email) return res.status(400).json({ message: 'Name and email are required.' });
  if (!validateEmail(email)) return res.status(400).json({ message: 'Invalid email address.' });
  const { hashPassword: hp } = require('./utils/password');
  const passwordHash = hp(password || crypto.randomBytes(12).toString('hex'));
  try {
    const [result] = await getPool().query(
      `INSERT INTO users (name, email, phone, password_hash, role, email_verified) VALUES (?, ?, ?, ?, ?, 1)`,
      [name.trim(), email.trim().toLowerCase(), phone.trim(), passwordHash, role]
    );
    res.status(201).json({ id: result.insertId, name: name.trim(), email, phone, role });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A user with this email already exists.' });
    throw err;
  }
}));

app.delete('/api/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const [result] = await getPool().query('DELETE FROM users WHERE id = ? AND role != "admin"', [Number(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ message: 'User not found or cannot delete admin.' });
  res.json({ message: 'User deleted.' });
}));

// ─── ADMIN: SUPPLIERS ─────────────────────────────────────────────────────────
app.get('/api/admin/suppliers', requireAdmin, asyncHandler(async (req, res) => {
  const [rows] = await getPool().query('SELECT * FROM suppliers ORDER BY id DESC');
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    contact: r.contact || '',
    phone: r.phone || '',
    email: r.email || '',
    address: r.address || '',
    notes: r.notes || '',
    createdAt: r.created_at
  })));
}));

app.post('/api/admin/suppliers', requireAdmin, asyncHandler(async (req, res) => {
  const { name, contact = '', phone = '', email = '', address = '', notes = '' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Supplier name is required.' });
  const [result] = await getPool().query(
    `INSERT INTO suppliers (name, contact, phone, email, address, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    [name.trim(), contact.trim(), phone.trim(), email.trim(), address.trim(), notes.trim()]
  );
  res.status(201).json({ id: result.insertId, name: name.trim(), contact, phone, email, address, notes });
}));

app.patch('/api/admin/suppliers/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { name, contact = '', phone = '', email = '', address = '', notes = '' } = req.body;
  const [result] = await getPool().query(
    `UPDATE suppliers SET name=?, contact=?, phone=?, email=?, address=?, notes=? WHERE id=?`,
    [name, contact, phone, email, address, notes, Number(req.params.id)]
  );
  if (!result.affectedRows) return res.status(404).json({ message: 'Supplier not found.' });
  res.json({ message: 'Supplier updated.' });
}));

app.delete('/api/admin/suppliers/:id', requireAdmin, asyncHandler(async (req, res) => {
  const [result] = await getPool().query('DELETE FROM suppliers WHERE id = ?', [Number(req.params.id)]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Supplier not found.' });
  res.json({ message: 'Supplier deleted.' });
}));

// ─── ADMIN: UPDATE CUSTOMER ─────────────────────────────
app.patch('/api/admin/customers/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { name, phone = '', email = '' } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Customer name is required.' });
  }

  if (email && !validateEmail(email)) {
    return res.status(400).json({ message: 'Invalid email address.' });
  }

  const [result] = await getPool().query(
    `UPDATE users
     SET name = ?, phone = ?, email = ?
     WHERE id = ? AND role = 'customer'`,
    [
      String(name).trim(),
      String(phone).trim(),
      String(email).trim().toLowerCase(),
      id
    ]
  );

  if (!result.affectedRows) {
    return res.status(404).json({ message: 'Customer not found.' });
  }

  res.json({ message: 'Customer updated.' });
}));

// ─── ADMIN: UPDATE USER ─────────────────────────────
app.patch('/api/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, phone = '', role = 'customer', password = '' } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required.' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ message: 'Invalid email address.' });
  }

  const allowedRoles = ['admin', 'customer'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role.' });
  }

  const params = [
    String(name).trim(),
    String(email).trim().toLowerCase(),
    String(phone).trim(),
    role
  ];

  let sql = `
    UPDATE users
    SET name = ?, email = ?, phone = ?, role = ?
  `;

  if (password && String(password).trim().length > 0) {
    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const { hashPassword: hp } = require('./utils/password');
    sql += `, password_hash = ?`;
    params.push(hp(password));
  }

  sql += ` WHERE id = ?`;
  params.push(id);

  const [result] = await getPool().query(sql, params);

  if (!result.affectedRows) {
    return res.status(404).json({ message: 'User not found.' });
  }

  res.json({ message: 'User updated.' });
}));

// ─── ADMIN: DELETE ORDER / SALE ─────────────────────────────
app.delete('/api/admin/orders/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const [result] = await getPool().query(
    'DELETE FROM orders WHERE id = ?',
    [id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({ message: 'Order not found.' });
  }

  res.json({ message: 'Order deleted.' });
}));

// ─── ADMIN: MESSAGE STATUS UPDATE ─────────────────────────────
app.patch('/api/admin/messages/:id/status', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status = 'read' } = req.body;

  const allowed = ['new', 'read', 'replied'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: 'Invalid message status.' });
  }

  const [result] = await getPool().query(
    'UPDATE messages SET status = ? WHERE id = ?',
    [status, id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({ message: 'Message not found.' });
  }

  res.json({ message: 'Message status updated.' });
}));

// Only serve index.html for HTML page routes, not asset requests
app.get('*', (req, res) => {
  const p = req.path;
  // If it looks like a static asset (has extension), return 404 instead of index.html
  if (/\.[a-z0-9]{1,5}$/i.test(p)) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Catches errors thrown inside asyncHandler-wrapped routes
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

let dbReady = false;

async function prepareDatabase(){
  if(!dbReady){
    await initDatabase();
    dbReady = true;
  }
}

/* Vercel needs an exported function */
module.exports = async function handler(req, res){
  try{
    await prepareDatabase();
    return app(req, res);
  }catch(err){
    console.error('Failed to handle request:', err);
    res.status(500).json({ message: 'Server failed to start.' });
  }
};

/* Local development */
if(require.main === module){
  prepareDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Thushan Motors API running on http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
