'use strict';

const mysql = require('mysql2/promise');
const crypto = require('crypto');

let pool = null;

function getPool() {
  if (!pool) throw new Error('Database pool not initialized. Call initDatabase() first.');
  return pool;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(String(password)).digest('hex');
  return `${salt}:${hash}`;
}

async function initDatabase() {
  // Aiven requires SSL — no self-signed cert verification needed when using
  // the cloud CA, but we set rejectUnauthorized: false for simpler setup.
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'defaultdb',
    ssl: process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud.com')
      ? { rejectUnauthorized: false }
      : false,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // Speed tweaks
    timezone: 'Z',
    charset: 'utf8mb4',
  });

  // Test connection
  const conn = await pool.getConnection();
  console.log(`✅ Database connected: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  conn.release();

  await createTables();
  await seedAdminIfMissing();
  await seedProductsIfEmpty();
}

async function createTables() {
  const p = pool;

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      phone VARCHAR(30) DEFAULT '',
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
      google_id VARCHAR(128) DEFAULT NULL,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      email_otp_hash VARCHAR(64) DEFAULT NULL,
      email_otp_expires_at DATETIME DEFAULT NULL,
      email_otp_attempts INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      brand VARCHAR(100) DEFAULT NULL,
      category VARCHAR(100) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      old_price DECIMAL(10,2) DEFAULT NULL,
      buy_price DECIMAL(10,2) DEFAULT NULL,
      stock TINYINT(1) NOT NULL DEFAULT 1,
      featured TINYINT(1) NOT NULL DEFAULT 0,
      img LONGTEXT,
      free_delivery TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Add buy_price column if upgrading from old schema
  await p.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS buy_price DECIMAL(10,2) DEFAULT NULL
  `).catch(() => {});

  await p.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_no VARCHAR(20) NOT NULL UNIQUE,
      user_id INT NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      discount DECIMAL(10,2) NOT NULL DEFAULT 0,
      total DECIMAL(10,2) NOT NULL,
      delivery_name VARCHAR(150) NOT NULL,
      delivery_phone VARCHAR(30) NOT NULL,
      delivery_address TEXT NOT NULL,
      delivery_district VARCHAR(100) NOT NULL,
      delivery_notes TEXT,
      payment_method ENUM('cash_on_delivery','bank_transfer','card') NOT NULL DEFAULT 'cash_on_delivery',
      payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      status ENUM('pending','confirmed','packed','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      name VARCHAR(200) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      quantity INT NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(30) DEFAULT '',
      email VARCHAR(190) DEFAULT '',
      message TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      contact VARCHAR(150) DEFAULT '',
      phone VARCHAR(30) DEFAULT '',
      email VARCHAR(190) DEFAULT '',
      address VARCHAR(500)  DEFAULT '' '',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('✅ All tables verified / created.');
}

async function seedAdminIfMissing() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@thushanmotors.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

  const [rows] = await pool.query('SELECT id FROM users WHERE role = "admin" LIMIT 1');
  if (rows.length) return;

  const hash = hashPassword(adminPassword);
  await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, email_verified) VALUES (?, ?, ?, ?, ?, ?)`,
    ['Admin', adminEmail, '', hash, 'admin', 1]
  );
  console.log(`✅ Admin account created: ${adminEmail}`);
}

async function seedProductsIfEmpty() {
  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM products');
  if (rows[0].cnt > 0) return;

  const products = [
    ['Brake Pad Set','Honda','engine',4500,null,null,1,1,'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=500',0],
    ['Motorcycle Chain','Yamaha','accessories',7900,null,null,1,1,'https://images.unsplash.com/photo-1558981359-219d6364c9c8?w=500',0],
    ['LED Headlight','TVS','electrical',5800,null,null,1,1,'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=500',1],
    ['Engine Oil 10W-40','Honda','engine',3200,null,null,1,1,'https://images.unsplash.com/photo-1517846693594-1567da72af75?w=500',0],
    ['Apache RTR Signal Lamps Rear Left','TVS','lights',1200,null,null,1,0,'https://images.unsplash.com/photo-1619771914272-7b0de4de0f4f?w=500',0],
    ['Apache RTR Signal Lamps Front Left','TVS','lights',1200,null,null,1,0,'https://images.unsplash.com/photo-1619771914272-7b0de4de0f4f?w=500',0],
    ['Motorcycle Battery 12V','Bajaj','electrical',9900,null,null,1,0,'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=500',0],
    ['Front Tyre 90/90-17','Hero','tyres',12500,null,null,1,0,'https://images.unsplash.com/photo-1580310614729-ccd69652491d?w=500',0],
    ['Rear Tyre 90/90-17','Bajaj','tyres',14500,17500,null,1,0,'https://images.unsplash.com/photo-1580310614729-ccd69652491d?w=500',0],
    ['Tyre 90/90-17','Yamaha','tyres',16250,19750,null,1,0,'https://images.unsplash.com/photo-1580310614729-ccd69652491d?w=500',0],
    ['Full Exhaust System','KTM','engine',28000,34000,null,1,0,'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=500',1],
    ['Rear Shock Absorber','Honda','suspension',8500,null,null,0,0,'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=500',0],
    ['Full Face Helmet',null,'accessories',18500,null,null,1,0,'https://images.unsplash.com/photo-1558981359-219d6364c9c8?w=500',1],
    ['Carburetor Assembly','Yamaha','engine',6800,null,null,1,0,'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=500',0],
  ];

  for (const p of products) {
    await pool.query(
      `INSERT INTO products (name,brand,category,price,old_price,buy_price,stock,featured,img,free_delivery) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      p
    );
  }
  console.log('✅ Seed products inserted.');
}

module.exports = { initDatabase, getPool };