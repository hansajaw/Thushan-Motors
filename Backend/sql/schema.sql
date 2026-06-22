-- ============================================================
-- Thushan Motors — MySQL schema
-- Run this with: mysql -u root -p < schema.sql
-- (Node will also create all of this automatically on first run
--  via config/db.js — this file is just for manual setup/reference.)
-- ============================================================

CREATE DATABASE IF NOT EXISTS thushan_motors
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE thushan_motors;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(30) DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) DEFAULT '',
  email VARCHAR(190) DEFAULT '',
  message TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'new',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Starter product catalog (only needed if the table is empty)
INSERT INTO products (name, brand, category, price, old_price, stock, featured, img, free_delivery)
VALUES
('Brake Pad Set', 'Honda', 'engine', 4500, NULL, 1, 1, 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=500', 0),
('Motorcycle Chain', 'Yamaha', 'accessories', 7900, NULL, 1, 1, 'https://images.unsplash.com/photo-1558981359-219d6364c9c8?w=500', 0),
('LED Headlight', 'TVS', 'electrical', 5800, NULL, 1, 1, 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=500', 1),
('Engine Oil 10W-40', 'Honda', 'engine', 3200, NULL, 1, 1, 'https://images.unsplash.com/photo-1517846693594-1567da72af75?w=500', 0),
('Apache RTR Signal Lamps Rear Left', 'TVS', 'lights', 1200, NULL, 1, 0, 'https://images.unsplash.com/photo-1619771914272-7b0de4de0f4f?w=500', 0),
('Apache RTR Signal Lamps Front Left', 'TVS', 'lights', 1200, NULL, 1, 0, 'https://images.unsplash.com/photo-1619771914272-7b0de4de0f4f?w=500', 0),
('Motorcycle Battery 12V', 'Bajaj', 'electrical', 9900, NULL, 1, 0, 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=500', 0),
('Front Tyre 90/90-17', 'Hero', 'tyres', 12500, NULL, 1, 0, 'https://images.unsplash.com/photo-1580310614729-ccd69652491d?w=500', 0),
('Rear Tyre 90/90-17', 'Bajaj', 'tyres', 14500, 17500, 1, 0, 'https://images.unsplash.com/photo-1580310614729-ccd69652491d?w=500', 0),
('Tyre 90/90-17', 'Yamaha', 'tyres', 16250, 19750, 1, 0, 'https://images.unsplash.com/photo-1580310614729-ccd69652491d?w=500', 0),
('Full Exhaust System', 'KTM', 'engine', 28000, 34000, 1, 0, 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=500', 1),
('Rear Shock Absorber', 'Honda', 'suspension', 8500, NULL, 0, 0, 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=500', 0),
('Full Face Helmet', NULL, 'accessories', 18500, NULL, 1, 0, 'https://images.unsplash.com/photo-1558981359-219d6364c9c8?w=500', 1),
('Carburetor Assembly', 'Yamaha', 'engine', 6800, NULL, 1, 0, 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=500', 0);
