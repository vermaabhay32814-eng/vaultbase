const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// ------------------------------------------------------------------
// Helper: translate SQLite constraint errors into clean 4xx responses
// (Pillar 4: The Shield — the DB is the final source of truth)
// ------------------------------------------------------------------
function handleDbError(res, err) {
  const msg = err.message || '';
  if (msg.includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: 'That email is already registered.' });
  }
  if (msg.includes('NOT NULL constraint failed')) {
    return res.status(400).json({ error: 'A required field is missing.' });
  }
  if (msg.includes('CHECK constraint failed')) {
    return res.status(400).json({ error: 'One of the values you entered is invalid.' });
  }
  if (msg.includes('FOREIGN KEY constraint failed')) {
    return res.status(400).json({ error: 'That customer does not exist.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error.' });
}

// Required-field guard: SQLite bindings reject `undefined`, so we validate
// presence ourselves and let the schema's NOT NULL/CHECK constraints handle
// the rest (Pillar 4: The Shield).
function requireFields(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      return `Missing required field: ${f}`;
    }
  }
  return null;
}

// ===================== CUSTOMERS (Pillar 3: CRUD) =====================

// CREATE  -> POST   -> INSERT
app.post('/api/customers', (req, res) => {
  const { name, email } = req.body || {};
  const err0 = requireFields(req.body || {}, ['name', 'email']);
  if (err0) return res.status(400).json({ error: err0 });
  try {
    // Parameterized query -- never string-concatenated (Pillar 4)
    const stmt = db.prepare('INSERT INTO customers (name, email) VALUES (?, ?)');
    const info = stmt.run(name, email);
    const created = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    handleDbError(res, err);
  }
});

// READ (all, with order counts)  -> GET -> SELECT
app.get('/api/customers', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(o.order_id) AS order_count, COALESCE(SUM(o.total),0) AS lifetime_value
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.customer_id
    GROUP BY c.customer_id
    ORDER BY c.created_at DESC
  `).all();
  res.json(rows);
});

// READ (one, with their orders)  -> GET -> SELECT
app.get('/api/customers/:id', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...customer, orders });
});

// UPDATE  -> PUT -> UPDATE
app.put('/api/customers/:id', (req, res) => {
  const { name, email } = req.body || {};
  const err0 = requireFields(req.body || {}, ['name', 'email']);
  if (err0) return res.status(400).json({ error: err0 });
  try {
    const stmt = db.prepare('UPDATE customers SET name = ?, email = ? WHERE customer_id = ?');
    const info = stmt.run(name, email, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Customer not found.' });
    res.json(db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(req.params.id));
  } catch (err) {
    handleDbError(res, err);
  }
});

// DELETE  -> DELETE -> DELETE (cascades to their orders)
app.delete('/api/customers/:id', (req, res) => {
  const info = db.prepare('DELETE FROM customers WHERE customer_id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Customer not found.' });
  res.status(204).end();
});

// ===================== ORDERS (Pillar 3: CRUD) =====================

app.post('/api/orders', (req, res) => {
  const { customer_id, item, total, status } = req.body || {};
  const err0 = requireFields(req.body || {}, ['customer_id', 'item', 'total']);
  if (err0) return res.status(400).json({ error: err0 });
  try {
    const stmt = db.prepare(
      'INSERT INTO orders (customer_id, item, total, status) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(customer_id, item, total, status || 'pending');
    const created = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/orders', (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, c.name AS customer_name
    FROM orders o
    JOIN customers c ON c.customer_id = o.customer_id
    ORDER BY o.created_at DESC
  `).all();
  res.json(rows);
});

app.get('/api/orders/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Order not found.' });
  res.json(row);
});

app.put('/api/orders/:id', (req, res) => {
  const { item, total, status } = req.body || {};
  const err0 = requireFields(req.body || {}, ['item', 'total', 'status']);
  if (err0) return res.status(400).json({ error: err0 });
  try {
    const stmt = db.prepare('UPDATE orders SET item = ?, total = ?, status = ? WHERE order_id = ?');
    const info = stmt.run(item, total, status, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Order not found.' });
    res.json(db.prepare('SELECT * FROM orders WHERE order_id = ?').get(req.params.id));
  } catch (err) {
    handleDbError(res, err);
  }
});

app.delete('/api/orders/:id', (req, res) => {
  const info = db.prepare('DELETE FROM orders WHERE order_id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Order not found.' });
  res.status(204).end();
});

// ===================== Demo: SQL Injection safety check =====================
// Lets the UI prove that parameterized queries neutralize injection attempts.
app.post('/api/security/test-injection', (req, res) => {
  const { email } = req.body || {};
  if (email === undefined || email === null) return res.status(400).json({ error: 'Missing required field: email' });
  const stmt = db.prepare('SELECT * FROM customers WHERE email = ?');
  const result = stmt.get(email);
  res.json({
    input: email,
    matched: !!result,
    message: result
      ? 'Matched a real record (input treated as plain data).'
      : 'No match — the injection payload was treated as harmless text, not executable SQL.'
  });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`VaultBase API running on http://localhost:${PORT}`);
});
