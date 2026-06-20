# VaultBase — Project 3: Database Integration

A full-stack CRUD application built for DecodeLabs' Project 3 brief: schema design, CRUD operations, and reliable data handling.

## What's inside

- **backend/** — Node.js + Express REST API backed by SQLite (`node:sqlite`, Node's built-in driver — no native compile step needed).
  - `db.js` — schema definition (`customers` 1-to-many `orders`), constraints (`UNIQUE`, `NOT NULL`, `CHECK`, `FOREIGN KEY ... ON DELETE CASCADE`), and seed data.
  - `server.js` — full CRUD REST endpoints for both tables, all queries parameterized (no string concatenation), clear error responses for constraint violations, plus a live SQL-injection demo endpoint.
- **frontend/** — Vanilla HTML/CSS/JS dashboard ("VaultBase") styled around the brief's blueprint/vault metaphor:
  - **Blueprint** — ERD of the schema + REST↔SQL action map + live stats.
  - **Customers** — table view with create/edit/delete.
  - **Orders** — table view with create/edit/delete, foreign-keyed to a customer.
  - **The Shield** — a live SQL-injection test against the real API, side-by-side with the vulnerable-vs-parameterized code.

## Run it

**1. Backend**

```bash
cd backend
npm install        # installs express + cors only (no native build step)
node server.js      # → http://localhost:4000
```

A `vaultbase.db` SQLite file and seed data (3 customers, 5 orders) are created automatically on first run.

**2. Frontend**
Serve the `frontend/` folder with any static server, e.g.:

```bash
cd frontend
python -m http.server 5500
```

If your environment uses `python3`, you can also run:

```bash
python3 -m http.server 5500
```

On Windows, if the `python` command is not available, use the full executable path, for example:

```bash
C:\Python314\python.exe -m http.server 5500
```

Then open `http://localhost:5500` in your browser. The dashboard talks to the API at `http://localhost:4000`.

> Requires Node.js 22.5+ (uses the built-in `node:sqlite` module).

## API reference

| Method | Path                         | Action                             |
| ------ | ---------------------------- | ---------------------------------- |
| GET    | /api/customers               | List customers + order counts      |
| GET    | /api/customers/:id           | One customer + their orders        |
| POST   | /api/customers               | Create customer                    |
| PUT    | /api/customers/:id           | Update customer                    |
| DELETE | /api/customers/:id           | Delete customer (cascades orders)  |
| GET    | /api/orders                  | List orders (joined with customer) |
| POST   | /api/orders                  | Create order                       |
| PUT    | /api/orders/:id              | Update order                       |
| DELETE | /api/orders/:id              | Delete order                       |
| POST   | /api/security/test-injection | Demo: parameterized query vs. SQLi |

## How it maps to the brief

- **Pillar 1 — Blueprint**: `customers` / `orders` tables, one-to-many relationship via `customer_id` FK.
- **Pillar 2 — Bridge**: native SQLite driver (`node:sqlite`) connects Express to storage.
- **Pillar 3 — Action**: every CRUD verb implemented and mapped to its HTTP method (`POST`/`GET`/`PUT`/`DELETE`) and SQL statement (`INSERT`/`SELECT`/`UPDATE`/`DELETE`).
- **Pillar 4 — Shield**: `UNIQUE`, `NOT NULL`, `CHECK` constraints at the schema level; all queries use `?` placeholders, never string concatenation — provable in the app's "Shield" tab.
