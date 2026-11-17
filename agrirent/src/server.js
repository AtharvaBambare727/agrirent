/**
 * server.js - Express Backend for AgriRent
 * 
 * Simple, beginner-friendly Express.js server for 1st-year college project.
 * Connects frontend forms to the SQLite database via clean REST APIs.
 */

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// JWT Secret Key (stored safely in data/.jwt_secret)
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  const secretFile = path.join(dataDir, '.jwt_secret');
  if (!fs.existsSync(secretFile)) {
    fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));
  }
  JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
}

const app = express();
app.set('trust proxy', 1);

// Security headers: Disable CSP to ensure all buttons, inline scripts, and modals work 100% without browser restrictions
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

// ---------- Helpers & Validation ----------
const ROLES = ['Farmer', 'Equipment Owner', 'Administrator'];
const CATEGORIES = ['Tractors', 'Harvesters', 'Tools', 'Irrigation'];
const cleanStr = (v, max = 255) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+() -]{10,15}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const bad = (res, message, status = 400) => res.status(status).json({ error: message });
const publicUser = u => ({ id: u.id, name: u.name, role: u.role, email: u.email, phone: u.phone });

// Cookie session helper
function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 7 * 24 * 3600 * 1000
  });
}

// Authentication middleware
function auth(required = true) {
  return (req, res, next) => {
    try {
      const token = req.cookies.token;
      if (token) {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
        if (user) req.user = user;
      }
    } catch (_) {}

    if (required && !req.user) {
      return bad(res, 'Please log in first to perform this action.', 401);
    }
    next();
  };
}

// Role restriction middleware
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return bad(res, 'You do not have permission for this action.', 403);
  }
  next();
};

const wrap = fn => (req, res, next) => {
  try {
    fn(req, res, next);
  } catch (err) {
    next(err);
  }
};

// Rate limiter for login/signup
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' }
});

// ---------- 1. Authentication APIs ----------

// User Registration (Farmer or Equipment Owner)
app.post('/api/auth/signup', authLimiter, wrap((req, res) => {
  const name = cleanStr(req.body.name, 100);
  const role = cleanStr(req.body.role, 30);
  const phone = cleanStr(req.body.phone, 20);
  const email = cleanStr(req.body.email, 200).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirm = req.body.confirm;

  if (name.length < 2) return bad(res, 'Please enter your full name (at least 2 characters).');
  if (!['Farmer', 'Equipment Owner'].includes(role)) return bad(res, 'Role must be Farmer or Equipment Owner.');
  if (!PHONE_RE.test(phone)) return bad(res, 'Please enter a valid 10-digit mobile number.');
  if (!EMAIL_RE.test(email)) return bad(res, 'Please enter a valid email address.');
  if (password.length < 6 || password.length > 128) return bad(res, 'Password must be at least 6 characters.');
  if (confirm !== undefined && confirm !== password) return bad(res, 'Passwords do not match.');

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return bad(res, 'An account with this email already exists. Please log in.', 409);

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, role, phone, email, password_hash) VALUES (?,?,?,?,?)')
    .run(name, role, phone, email, hash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  setSessionCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
}));

// User Login
app.post('/api/auth/login', authLimiter, wrap((req, res) => {
  const email = cleanStr(req.body.email, 200).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = cleanStr(req.body.role, 30);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return bad(res, 'Invalid email or password. Please try again.', 401);
  }
  if (role && role !== user.role) {
    return bad(res, `This account is registered as '${user.role}'. Please select '${user.role}'.`, 403);
  }

  setSessionCookie(res, user);
  res.json({ user: publicUser(user) });
}));

// Demo 1-Click Login (Farmer / Owner / Admin) for college testing
app.post('/api/auth/demo-login', wrap((req, res) => {
  const type = cleanStr(req.body.type, 20).toLowerCase();
  let email = 'farmer@agrirent.com';
  if (type === 'owner') email = 'owner@agrirent.com';
  if (type === 'admin') email = 'admin@agrirent.com';

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return bad(res, 'Demo user account not found.', 404);

  setSessionCookie(res, user);
  res.json({ user: publicUser(user) });
}));

// User Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true, message: 'Logged out successfully.' });
});

// Check Current Session
app.get('/api/auth/me', auth(false), (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

// ---------- 2. Equipment Marketplace APIs ----------

const equipSelectQuery = `
  SELECT e.id, e.name, e.category, e.description, e.icon, e.price_per_day, e.location, e.available,
         e.owner_id, e.created_at,
         u.name AS owner_name, u.phone AS owner_phone, u.email AS owner_email
  FROM equipment e
  JOIN users u ON u.id = e.owner_id
`;

// Get All Equipment with Search and Category filters
app.get('/api/equipment', wrap((req, res) => {
  const q = cleanStr(req.query.q, 80);
  const category = cleanStr(req.query.category, 30);
  const location = cleanStr(req.query.location, 80);
  const popularOnly = req.query.popular === '1';

  const where = ['e.available = 1'];
  const args = [];
  const makeLike = s => '%' + s.replace(/[\\%_]/g, '\\$&') + '%';

  if (q) {
    where.push("(e.name LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\')");
    args.push(makeLike(q), makeLike(q));
  }
  if (category && category !== 'All') {
    where.push('e.category = ?');
    args.push(category);
  }
  if (location) {
    where.push("e.location LIKE ? ESCAPE '\\'");
    args.push(makeLike(location));
  }

  let sql = `${equipSelectQuery} WHERE ${where.join(' AND ')} ORDER BY e.id DESC`;
  if (popularOnly) {
    sql += ' LIMIT 3';
  } else {
    sql += ' LIMIT 100';
  }

  const rows = db.prepare(sql).all(...args);
  res.json({ equipment: rows });
}));

// Get Single Equipment Details by ID
app.get('/api/equipment/:id', wrap((req, res) => {
  const item = db.prepare(`${equipSelectQuery} WHERE e.id = ?`).get(req.params.id);
  if (!item) return bad(res, 'Equipment item not found.', 404);
  res.json({ equipment: item });
}));

// Helper to validate equipment body
function parseEquipmentPayload(body, partial = false) {
  const out = {};
  const name = cleanStr(body.name, 100);
  const category = cleanStr(body.category, 30);
  const icon = cleanStr(body.icon, 8) || '🚜';
  const price = Number(body.price_per_day);
  const location = cleanStr(body.location, 100);
  const description = cleanStr(body.description, 500);

  if (!partial || body.name !== undefined) {
    if (name.length < 2) throw new Error('Equipment name must be at least 2 characters.');
    out.name = name;
  }
  if (!partial || body.category !== undefined) {
    if (!CATEGORIES.includes(category)) throw new Error('Category must be: ' + CATEGORIES.join(', '));
    out.category = category;
  }
  if (!partial || body.price_per_day !== undefined) {
    if (!Number.isInteger(price) || price <= 0 || price > 500000) {
      throw new Error('Price per day must be a positive number (up to ₹500,000).');
    }
    out.price_per_day = price;
  }
  if (body.location !== undefined || !partial) out.location = location || 'Location set by owner';
  if (body.description !== undefined || !partial) out.description = description || 'Reliable agricultural equipment.';
  if (body.icon !== undefined || !partial) out.icon = icon;
  if (body.available !== undefined) out.available = body.available ? 1 : 0;

  return out;
}

// Add New Equipment (Equipment Owner or Admin)
app.post('/api/equipment', auth(), requireRole('Equipment Owner', 'Administrator'), wrap((req, res) => {
  let data;
  try {
    data = parseEquipmentPayload(req.body);
  } catch (err) {
    return bad(res, err.message);
  }

  const ins = db.prepare(
    'INSERT INTO equipment (owner_id, name, category, description, icon, price_per_day, location, available) VALUES (?,?,?,?,?,?,?,?)'
  );
  const info = ins.run(
    req.user.id,
    data.name,
    data.category,
    data.description,
    data.icon,
    data.price_per_day,
    data.location,
    1
  );

  const created = db.prepare(`${equipSelectQuery} WHERE e.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ equipment: created, message: 'Equipment added successfully!' });
}));

// Helper to check ownership of equipment
function verifyEquipmentOwner(req, res) {
  const item = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!item) {
    bad(res, 'Equipment item not found.', 404);
    return null;
  }
  if (item.owner_id !== req.user.id && req.user.role !== 'Administrator') {
    bad(res, 'You can only modify or delete your own equipment.', 403);
    return null;
  }
  return item;
}

// Edit Existing Equipment
app.put('/api/equipment/:id', auth(), wrap((req, res) => {
  const item = verifyEquipmentOwner(req, res);
  if (!item) return;

  let data;
  try {
    data = parseEquipmentPayload(req.body, true);
  } catch (err) {
    return bad(res, err.message);
  }

  const keys = Object.keys(data);
  if (keys.length === 0) return bad(res, 'No changes provided.');

  const sql = `UPDATE equipment SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map(k => data[k]), item.id);

  const updated = db.prepare(`${equipSelectQuery} WHERE e.id = ?`).get(item.id);
  res.json({ equipment: updated, message: 'Equipment updated successfully!' });
}));

// Toggle Equipment Availability (Available / Unavailable)
app.patch('/api/equipment/:id/toggle-availability', auth(), wrap((req, res) => {
  const item = verifyEquipmentOwner(req, res);
  if (!item) return;

  const newStatus = item.available === 1 ? 0 : 1;
  db.prepare('UPDATE equipment SET available = ? WHERE id = ?').run(newStatus, item.id);
  res.json({ ok: true, available: newStatus, message: newStatus === 1 ? 'Marked as Available' : 'Marked as Inactive' });
}));

// Delete Equipment
app.delete('/api/equipment/:id', auth(), wrap((req, res) => {
  const item = verifyEquipmentOwner(req, res);
  if (!item) return;

  db.prepare('DELETE FROM equipment WHERE id = ?').run(item.id);
  res.json({ ok: true, message: 'Equipment deleted successfully!' });
}));

// Get Equipment Owned by Logged-in Owner
app.get('/api/my/equipment', auth(), requireRole('Equipment Owner', 'Administrator'), wrap((req, res) => {
  const sql = `
    SELECT e.*,
      (SELECT COUNT(*) FROM rentals r WHERE r.equipment_id = e.id AND r.status = 'pending') AS pending_requests,
      (SELECT COUNT(*) FROM rentals r WHERE r.equipment_id = e.id AND r.status = 'approved') AS active_rentals
    FROM equipment e
    WHERE e.owner_id = ?
    ORDER BY e.id DESC
  `;
  const items = db.prepare(sql).all(req.user.id);
  res.json({ equipment: items });
}));

// ---------- 3. Rental Request APIs ----------

const rentalSelectQuery = `
  SELECT r.id, r.equipment_id, r.renter_id, r.start_date, r.end_date, r.total_price, r.message, r.status, r.created_at,
         e.name AS equipment_name, e.category AS equipment_category, e.icon AS equipment_icon, e.price_per_day, e.location AS equipment_location,
         e.owner_id,
         o.name AS owner_name, o.phone AS owner_phone, o.email AS owner_email,
         f.name AS renter_name, f.phone AS renter_phone, f.email AS renter_email
  FROM rentals r
  JOIN equipment e ON e.id = r.equipment_id
  JOIN users o ON o.id = e.owner_id
  JOIN users f ON f.id = r.renter_id
`;

// Helper to check for overlapping approved bookings
function checkDateConflict(equipmentId, start, end, ignoreRentalId = 0) {
  const row = db.prepare(`
    SELECT 1 FROM rentals
    WHERE equipment_id = ? AND status = 'approved' AND id != ?
      AND start_date <= ? AND end_date >= ?
  `).get(equipmentId, ignoreRentalId, end, start);
  return !!row;
}

// Request Equipment for Rent (Farmer)
app.post('/api/rentals', auth(), requireRole('Farmer'), wrap((req, res) => {
  const equipmentId = Number(req.body.equipment_id);
  const start = cleanStr(req.body.start_date, 10);
  const end = cleanStr(req.body.end_date, 10);
  const message = cleanStr(req.body.message, 500);

  const equip = db.prepare('SELECT * FROM equipment WHERE id = ? AND available = 1').get(equipmentId);
  if (!equip) return bad(res, 'This equipment is currently not available for rental.', 404);

  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return bad(res, 'Please provide valid start and end dates (YYYY-MM-DD).');
  }

  const today = new Date().toISOString().slice(0, 10);
  if (start < today) return bad(res, 'Start date cannot be in the past.');
  if (end < start) return bad(res, 'End date must be on or after the start date.');

  const diffDays = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  if (diffDays > 90) return bad(res, 'Maximum rental duration is 90 days.');

  if (checkDateConflict(equip.id, start, end)) {
    return bad(res, 'This equipment is already booked for the selected dates. Please choose another date range.', 409);
  }

  const totalPrice = diffDays * equip.price_per_day;
  const ins = db.prepare(
    'INSERT INTO rentals (equipment_id, renter_id, start_date, end_date, total_price, message, status) VALUES (?,?,?,?,?,?,?)'
  );
  const info = ins.run(equip.id, req.user.id, start, end, totalPrice, message, 'pending');

  const created = db.prepare(`${rentalSelectQuery} WHERE r.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ rental: created, message: 'Rental request submitted successfully!' });
}));

// View Rental Requests (Farmer sees own requests, Owner sees incoming requests for their equipment)
app.get('/api/rentals', auth(), wrap((req, res) => {
  const { role, id } = req.user;
  let sql = rentalSelectQuery;
  let params = [];

  if (role === 'Administrator') {
    sql += ' ORDER BY r.id DESC LIMIT 300';
  } else if (role === 'Equipment Owner') {
    sql += ' WHERE e.owner_id = ? ORDER BY r.id DESC LIMIT 300';
    params = [id];
  } else {
    // Farmer
    sql += ' WHERE r.renter_id = ? ORDER BY r.id DESC LIMIT 300';
    params = [id];
  }

  const rows = db.prepare(sql).all(...params);
  res.json({ rentals: rows });
}));

// Update Rental Request Status (Approve / Reject by Owner, or Cancel by Farmer)
app.patch('/api/rentals/:id', auth(), wrap((req, res) => {
  const status = cleanStr(req.body.status, 20).toLowerCase();
  const rental = db.prepare(`${rentalSelectQuery} WHERE r.id = ?`).get(req.params.id);

  if (!rental) return bad(res, 'Rental request not found.', 404);

  const isOwner = rental.owner_id === req.user.id;
  const isRenter = rental.renter_id === req.user.id;
  const isAdmin = req.user.role === 'Administrator';

  if (!isOwner && !isRenter && !isAdmin) {
    return bad(res, 'You do not have access to manage this rental.', 403);
  }

  if (status === 'cancelled') {
    if (!isRenter && !isAdmin) return bad(res, 'Only the farmer can cancel this request.', 403);
    if (!['pending', 'approved'].includes(rental.status)) {
      return bad(res, `Cannot cancel a rental that is already ${rental.status}.`, 409);
    }
  } else if (status === 'approved' || status === 'rejected') {
    if (!isOwner && !isAdmin) return bad(res, 'Only the equipment owner can approve or reject rental requests.', 403);
    if (rental.status !== 'pending') {
      return bad(res, `This request has already been ${rental.status}.`, 409);
    }
    if (status === 'approved' && checkDateConflict(rental.equipment_id, rental.start_date, rental.end_date, rental.id)) {
      return bad(res, 'Cannot approve: Overlaps with an already approved booking.', 409);
    }
  } else {
    return bad(res, 'Status must be approved, rejected, or cancelled.');
  }

  db.prepare('UPDATE rentals SET status = ? WHERE id = ?').run(status, rental.id);
  const updated = db.prepare(`${rentalSelectQuery} WHERE r.id = ?`).get(rental.id);
  res.json({ rental: updated, message: `Rental request has been ${status}.` });
}));

// ---------- 4. Dashboard Statistics API ----------
app.get('/api/dashboard/stats', auth(), wrap((req, res) => {
  const { role, id } = req.user;
  const countOf = (sql, ...args) => {
    const row = db.prepare(sql).get(...args);
    return row ? row.c : 0;
  };
  const sumOf = (sql, ...args) => {
    const row = db.prepare(sql).get(...args);
    return row ? (row.s || 0) : 0;
  };

  if (role === 'Farmer') {
    return res.json({
      role: 'Farmer',
      total_bookings: countOf('SELECT COUNT(*) AS c FROM rentals WHERE renter_id = ?', id),
      pending_requests: countOf("SELECT COUNT(*) AS c FROM rentals WHERE renter_id = ? AND status = 'pending'", id),
      approved_rentals: countOf("SELECT COUNT(*) AS c FROM rentals WHERE renter_id = ? AND status = 'approved'", id),
      total_spent: sumOf("SELECT SUM(total_price) AS s FROM rentals WHERE renter_id = ? AND status = 'approved'", id)
    });
  }

  if (role === 'Equipment Owner') {
    return res.json({
      role: 'Equipment Owner',
      total_equipment: countOf('SELECT COUNT(*) AS c FROM equipment WHERE owner_id = ?', id),
      total_requests: countOf('SELECT COUNT(*) AS c FROM rentals r JOIN equipment e ON e.id = r.equipment_id WHERE e.owner_id = ?', id),
      pending_requests: countOf("SELECT COUNT(*) AS c FROM rentals r JOIN equipment e ON e.id = r.equipment_id WHERE e.owner_id = ? AND r.status = 'pending'", id),
      approved_rentals: countOf("SELECT COUNT(*) AS c FROM rentals r JOIN equipment e ON e.id = r.equipment_id WHERE e.owner_id = ? AND r.status = 'approved'", id),
      total_earnings: sumOf("SELECT SUM(r.total_price) AS s FROM rentals r JOIN equipment e ON e.id = r.equipment_id WHERE e.owner_id = ? AND r.status = 'approved'", id)
    });
  }

  // Admin stats
  res.json({
    role: 'Administrator',
    total_users: countOf('SELECT COUNT(*) AS c FROM users'),
    farmers: countOf("SELECT COUNT(*) AS c FROM users WHERE role = 'Farmer'"),
    owners: countOf("SELECT COUNT(*) AS c FROM users WHERE role = 'Equipment Owner'"),
    total_equipment: countOf('SELECT COUNT(*) AS c FROM equipment'),
    total_rentals: countOf('SELECT COUNT(*) AS c FROM rentals'),
    pending_rentals: countOf("SELECT COUNT(*) AS c FROM rentals WHERE status = 'pending'")
  });
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'AgriRent Backend', time: new Date().toISOString() });
});

// ---------- 5. Static Frontend Serving ----------
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// Page Routing Aliases
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(publicPath, 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(publicPath, 'dashboard.html')));

// Catch-all API 404
app.use('/api', (req, res) => bad(res, 'API endpoint not found.', 404));

// Central error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error occurred.' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🌱 AgriRent System running successfully!`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🌾 SQLite Database: ${path.join(dataDir, 'agrirent.db')}\n`);
  });
}

module.exports = app;
