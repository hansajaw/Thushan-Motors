// config/db.js
// Handles the MySQL connection AND creates the database + tables automatically
// the first time the server starts, so you never have to set it up by hand.

require('dotenv').config();
const mysql = require('mysql2/promise');
const seedProducts = require('../data/seedProducts');
const { hashPassword } = require('../utils/password');

const {
  DB_HOST = 'localhost',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'thushan_motors',
  DB_SSL = 'false'
} = process.env;

// Aiven (and most cloud MySQL hosts) require an SSL connection.
// Set DB_SSL=true in your .env file when connecting to a cloud database.
// rejectUnauthorized: false is used because Aiven uses a self-signed CA
// certificate that Node.js doesn't trust by default. The connection is
// still encrypted (SSL) — this only skips strict certificate-chain checks.
const sslOption = DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

let pool = null;

// Step 1: connect to MySQL WITHOUT selecting a database, and create it if missing.
async function ensureDatabaseExists() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: sslOption
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  await connection.end();
}

// Step 2: create every table the app needs (safe to run every time, uses IF NOT EXISTS).
async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      phone VARCHAR(30) DEFAULT '',
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
      google_id VARCHAR(255) NULL UNIQUE,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      email_otp_hash VARCHAR(255) NULL,
      email_otp_expires_at DATETIME NULL,
      email_otp_attempts INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      brand VARCHAR(100) DEFAULT NULL,
      category VARCHAR(100) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      old_price DECIMAL(10,2) DEFAULT NULL,
      stock TINYINT(1) NOT NULL DEFAULT 1,
      featured TINYINT(1) NOT NULL DEFAULT 0,
      img LONGTEXT,
      free_delivery TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(30) DEFAULT '',
      email VARCHAR(190) DEFAULT '',
      message TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

// Step 2.5: MIGRATION — upgrades tables that were already created by an
// older version of this file (e.g. on Aiven, before img was LONGTEXT).
// ALTER TABLE is safe to run every server start. We check
// INFORMATION_SCHEMA first so it works on all MySQL versions (5.x/8.x).
async function runMigrations() {
  // Helper: check if a column exists in a table
  async function columnExists(table, column) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return rows[0].cnt > 0;
  }

  const tasks = [
    // Always-safe type change
    async () => pool.query(`ALTER TABLE products MODIFY COLUMN img LONGTEXT`),

    // Add subtotal column if missing
    async () => {
      if (!(await columnExists('orders', 'subtotal'))) {
        await pool.query(`ALTER TABLE orders ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0`);
        console.log('Migration: added orders.subtotal');
      }
    },

    // Add discount column if missing
    async () => {
      if (!(await columnExists('orders', 'discount'))) {
        await pool.query(`ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0`);
        console.log('Migration: added orders.discount');
      }
    },

    // Back-fill old rows: subtotal = total where subtotal is still 0
    async () => {
      if (await columnExists('orders', 'subtotal')) {
        await pool.query(`UPDATE orders SET subtotal = total WHERE subtotal = 0 AND total > 0`);
      }
    },

    // Add Google Auth and email verification columns to users if missing
    async () => {
      if (!(await columnExists('users', 'google_id'))) {
        await pool.query(`
          ALTER TABLE users
          ADD COLUMN google_id VARCHAR(255) NULL UNIQUE,
          ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0,
          ADD COLUMN email_otp_hash VARCHAR(255) NULL,
          ADD COLUMN email_otp_expires_at DATETIME NULL,
          ADD COLUMN email_otp_attempts INT NOT NULL DEFAULT 0;
        `);
        
        await pool.query(`UPDATE users SET email_verified = 1 WHERE email_verified = 0;`);
        console.log('Migration: added Google auth and email verification columns to users');
      }
    },
  ];

  for (const task of tasks) {
    try { await task(); } catch (err) {
      console.warn('Migration skipped (safe to ignore):', err.message);
    }
  }
}

// Step 3: if the products table is empty, fill it with your starter catalog.
async function seedProductsIfEmpty() {
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM products');
  if (rows[0].count > 0) return;

  for (const p of seedProducts) {
    await pool.query(
      `INSERT INTO products (name, brand, category, price, old_price, stock, featured, img, free_delivery)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.name,
        p.brand || null,
        p.category,
        p.price,
        p.oldPrice || null,
        p.stock ? 1 : 0,
        p.featured ? 1 : 0,
        p.img || '',
        p.freeDelivery ? 1 : 0
      ]
    );
  }

  console.log(`Seeded ${seedProducts.length} starter products.`);
}

// Step 4: make sure there is always at least one real admin account in
// the database, so the admin panel login (email + password, same form a
// customer uses) actually has something to log into. Controlled by
// ADMIN_EMAIL / ADMIN_PASSWORD in .env — only runs the INSERT the very
// first time (when no admin row exists yet), so it's safe to leave in
// the startup sequence forever.
async function seedAdminIfMissing() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set in .env — skipping admin account setup.');
    return;
  }

  const [existingAdmins] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existingAdmins.length) return;

  const cleanEmail = String(ADMIN_EMAIL).trim().toLowerCase();
  const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);

  if (existingEmail.length) {
    // Email already belongs to a customer account — promote it instead
    // of creating a duplicate (email column is UNIQUE).
    await pool.query("UPDATE users SET role = 'admin' WHERE id = ?", [existingEmail[0].id]);
    console.log(`Promoted existing account ${cleanEmail} to admin.`);
    return;
  }

  const passwordHash = hashPassword(ADMIN_PASSWORD);
  await pool.query(
    'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    ['Admin', cleanEmail, '', passwordHash, 'admin']
  );
  console.log(`Created admin account: ${cleanEmail} (log into /admin.html with this email + the ADMIN_PASSWORD from .env)`);
}

// Call this once when the server boots.
async function initDatabase() {
  await ensureDatabaseExists();

  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: sslOption,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true // return DECIMAL columns as numbers, not strings
  });

  await createTables();
  await runMigrations();
  await seedProductsIfEmpty();
  await seedAdminIfMissing();

  console.log(`Connected to MySQL database "${DB_NAME}" on ${DB_HOST}:${DB_PORT}`);
  return pool;
}

function getPool() {
  if (!pool) throw new Error('Database not initialized yet. Call initDatabase() first.');
  return pool;
}

module.exports = { initDatabase, getPool };