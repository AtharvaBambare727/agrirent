/**
 * db.js - SQLite Database Setup for AgriRent
 * 
 * Simple, beginner-friendly database setup using SQLite.
 * Uses Node.js built-in 'node:sqlite' (or 'better-sqlite3' if available).
 * Data is permanently saved in data/agrirent.db file.
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Ensure data folder exists
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'agrirent.db');

// Database connection wrapper (works seamlessly across all Node.js versions)
function connectDatabase(filePath) {
  let rawDb;
  let isNodeSqlite = false;

  try {
    // Modern Node.js built-in SQLite (Node 22.5+)
    const { DatabaseSync } = require('node:sqlite');
    rawDb = new DatabaseSync(filePath);
    isNodeSqlite = true;
    rawDb.exec('PRAGMA foreign_keys = ON;');
    rawDb.exec('PRAGMA journal_mode = WAL;');
  } catch (err) {
    // Fallback to better-sqlite3 package
    const Database = require('better-sqlite3');
    rawDb = new Database(filePath);
    rawDb.pragma('foreign_keys = ON');
    rawDb.pragma('journal_mode = WAL');
  }

  if (!isNodeSqlite) return rawDb;

  // Simple compatibility wrapper so query methods look identical and beginner-friendly
  return {
    exec(sql) {
      return rawDb.exec(sql);
    },
    pragma(sql) {
      return rawDb.exec('PRAGMA ' + sql);
    },
    prepare(sql) {
      const stmt = rawDb.prepare(sql);
      return {
        run(...args) {
          const cleanArgs = args.flat().map(a => (a === undefined ? null : a));
          return stmt.run(...cleanArgs);
        },
        get(...args) {
          const cleanArgs = args.flat().map(a => (a === undefined ? null : a));
          return stmt.get(...cleanArgs);
        },
        all(...args) {
          const cleanArgs = args.flat().map(a => (a === undefined ? null : a));
          return stmt.all(...cleanArgs);
        }
      };
    }
  };
}

const db = connectDatabase(dbPath);

// 1. Create Tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Farmer', 'Equipment Owner', 'Administrator')),
  phone TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Tractors', 'Harvesters', 'Tools', 'Irrigation')),
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '🚜',
  price_per_day INTEGER NOT NULL CHECK (price_per_day > 0),
  location TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  renter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_price INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_equipment_owner ON equipment(owner_id);
CREATE INDEX IF NOT EXISTS idx_rentals_equipment ON rentals(equipment_id, status);
CREATE INDEX IF NOT EXISTS idx_rentals_renter ON rentals(renter_id);
`);

// 2. Helper function to seed an account if not present
function seedUser(name, role, phone, email, plainPassword) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing.id;
  const hash = bcrypt.hashSync(plainPassword, 10);
  const info = db.prepare('INSERT INTO users (name, role, phone, email, password_hash) VALUES (?,?,?,?,?)')
    .run(name, role, phone, email, hash);
  return info.lastInsertRowid;
}

// 3. Seed Demo Accounts for Easy College Viva / Testing
const adminId = seedUser('Admin User', 'Administrator', '9900000000', 'admin@agrirent.com', 'password123');
const ownerId = seedUser('Ramesh Patel', 'Equipment Owner', '9876543210', 'owner@agrirent.com', 'password123');
const farmerId = seedUser('Suresh Kumar', 'Farmer', '9123456789', 'farmer@agrirent.com', 'password123');

// 4. Seed Initial Equipment Catalog if empty
const countObj = db.prepare('SELECT COUNT(*) AS total FROM equipment').get();
if (!countObj || countObj.total === 0) {
  const insertEquipment = db.prepare(
    'INSERT INTO equipment (owner_id, name, category, description, icon, price_per_day, location, available) VALUES (?,?,?,?,?,?,?,?)'
  );

  const initialItems = [
    [
      ownerId,
      'Mahindra 575 DI Tractor',
      'Tractors',
      '47 HP heavy duty farm tractor with hydraulic lift. Ideal for plowing, haulage, and rotavation.',
      '🚜',
      1200,
      'Nashik, Maharashtra',
      1
    ],
    [
      ownerId,
      'John Deere W70 Combine Harvester',
      'Harvesters',
      'High-speed grain harvester with minimal grain loss. Best for wheat, paddy, and soybean.',
      '🌾',
      4500,
      'Pune, Maharashtra',
      1
    ],
    [
      ownerId,
      'Shaktiman Rotary Tiller',
      'Tools',
      '6-feet soil tiller with boron steel blades for fast seedbed preparation in a single pass.',
      '⚙️',
      900,
      'Ahmednagar, Maharashtra',
      1
    ],
    [
      ownerId,
      'Kirloskar 5 HP Water Pump',
      'Irrigation',
      'Portable diesel irrigation pump with suction hose for canals, wells, and farm ponds.',
      '💧',
      500,
      'Kolhapur, Maharashtra',
      1
    ],
    [
      ownerId,
      'Precision 9-Row Seed Drill',
      'Tools',
      'Uniform depth seed sower with fertilizer placement box. Suitable for wheat, gram, and maize.',
      '🌱',
      750,
      'Solapur, Maharashtra',
      1
    ],
    [
      ownerId,
      'Mitra 400L Boom Crop Sprayer',
      'Tools',
      'Tractor-mounted boom sprayer with adjustable pressure nozzles for pest and weed control.',
      '🧑‍🌾',
      350,
      'Sangli, Maharashtra',
      1
    ]
  ];

  const createdIds = [];
  initialItems.forEach(item => {
    const res = insertEquipment.run(...item);
    createdIds.push(res.lastInsertRowid);
  });

  // Seed sample rental requests so farmer and owner dashboards have realistic data immediately
  const insertRental = db.prepare(
    'INSERT INTO rentals (equipment_id, renter_id, start_date, end_date, total_price, message, status) VALUES (?,?,?,?,?,?,?)'
  );

  const today = new Date();
  const nextWeek = new Date(today.getTime() + 4 * 86400000).toISOString().slice(0, 10);
  const endWeek = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  // 1 pending request for owner to approve or reject
  insertRental.run(createdIds[0], farmerId, nextWeek, endWeek, 4800, 'Need for 4 days of winter wheat land preparation.', 'pending');

  // 1 approved rental
  const laterStart = new Date(today.getTime() + 10 * 86400000).toISOString().slice(0, 10);
  const laterEnd = new Date(today.getTime() + 12 * 86400000).toISOString().slice(0, 10);
  insertRental.run(createdIds[2], farmerId, laterStart, laterEnd, 2700, 'Soil tilling for vegetable crop.', 'approved');
}

module.exports = db;
