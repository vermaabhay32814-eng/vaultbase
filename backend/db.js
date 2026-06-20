const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'vaultbase.db'));
db.exec('PRAGMA foreign_keys = ON;');

// ---- Pillar 1: The Blueprint (Schema & Design) ----
// Customers (1) -> Orders (Many)   => One-to-Many relationship
// Constraints enforce integrity at the schema level (Pillar 4: The Shield)
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    customer_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
    email         TEXT NOT NULL UNIQUE,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    order_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id   INTEGER NOT NULL,
    item          TEXT NOT NULL CHECK (length(trim(item)) > 0),
    total         REAL NOT NULL CHECK (total >= 0),
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shipped','delivered','cancelled')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
`);

// Seed only if empty
const count = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
if (count === 0) {
  const insertCustomer = db.prepare('INSERT INTO customers (name, email) VALUES (?, ?)');
  const insertOrder = db.prepare('INSERT INTO orders (customer_id, item, total, status) VALUES (?, ?, ?, ?)');

  db.exec('BEGIN');
  try {
    const alice = insertCustomer.run('Alice Sharma', 'alice@email.com').lastInsertRowid;
    const bilal = insertCustomer.run('Bilal Khan', 'bilal@email.com').lastInsertRowid;
    const chen  = insertCustomer.run('Chen Wei', 'chen@email.com').lastInsertRowid;

    insertOrder.run(alice, 'Mechanical Keyboard', 4200, 'delivered');
    insertOrder.run(alice, 'USB-C Hub', 1500, 'shipped');
    insertOrder.run(bilal, 'Monitor Stand', 1800, 'pending');
    insertOrder.run(chen, '27" Monitor', 18500, 'delivered');
    insertOrder.run(chen, 'Webcam', 3200, 'cancelled');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = db;
