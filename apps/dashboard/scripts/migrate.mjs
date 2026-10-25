// Idempotent, additive migration (Phase 1: inventory + events + purchasing).
// Safe to re-run: every statement is IF NOT EXISTS / ON CONFLICT DO NOTHING and
// nothing existing is altered or dropped.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const sql = neon(process.env.DATABASE_URL);

const statements = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,

  `CREATE TABLE IF NOT EXISTS settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS materials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku text NOT NULL UNIQUE,
    name text NOT NULL,
    unit text NOT NULL DEFAULT 'unit',
    reorder_point integer,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // One row per material. available = on_hand - reserved; projected adds on_order.
  `CREATE TABLE IF NOT EXISTS inventory_balances (
    material_id uuid PRIMARY KEY REFERENCES materials(id) ON DELETE CASCADE,
    on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    on_order integer NOT NULL DEFAULT 0 CHECK (on_order >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reserved_within_on_hand CHECK (reserved <= on_hand)
  )`,

  // Append-only ledger: balances can always be audited against this.
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    delta integer NOT NULL,
    kind text NOT NULL CHECK (kind IN ('receipt','reserve','release','consume','adjust')),
    ref_type text,
    ref_id text,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS stock_movements_material_idx ON stock_movements (material_id, created_at DESC)`,

  // Outbox / event queue.
  `CREATE TABLE IF NOT EXISTS events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL,
    entity_type text,
    entity_id text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','dead')),
    attempts integer NOT NULL DEFAULT 0,
    dedupe_key text UNIQUE,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    processed_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS events_status_idx ON events (status, created_at)`,

  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id uuid NOT NULL REFERENCES materials(id),
    supplier text,
    qty integer NOT NULL CHECK (qty > 0),
    unit_price numeric(12,2),
    total_price numeric(14,2),
    lead_time_days integer,
    source text NOT NULL CHECK (source IN ('auto','negotiated','manual')),
    status text NOT NULL CHECK (status IN ('needs_approval','placed','received','cancelled')),
    threshold_used integer,
    reason text,
    negotiation_id uuid,
    expected_at date,
    created_at timestamptz NOT NULL DEFAULT now(),
    received_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS purchase_orders_status_idx ON purchase_orders (status, created_at DESC)`,

  // Agent run log feeding the console / right sidebar (Phase 3 UI).
  `CREATE TABLE IF NOT EXISTS agent_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent text NOT NULL,
    title text,
    trigger_event_id uuid,
    status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS agent_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    seq integer NOT NULL,
    kind text NOT NULL CHECK (kind IN ('thinking','tool','result','message')),
    name text,
    input jsonb,
    output jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, seq)
  )`,

  // Defaults.
  `INSERT INTO settings (key, value) VALUES
    ('auto_buy_threshold', '200'::jsonb),
    ('auto_buy_enabled', 'true'::jsonb),
    ('max_auto_spend_per_day', '50000'::jsonb)
   ON CONFLICT (key) DO NOTHING`,

  `INSERT INTO materials (sku, name, unit, reorder_point) VALUES
    ('MAT-OAK',   'Oak wood planks',     'pcs', 150),
    ('MAT-STEEL', 'Steel legs',          'pcs', 200),
    ('MAT-SCREW', 'Wood screws (box)',   'box', 100),
    ('MAT-VARN',  'Wood varnish',        'ltr', 60),
    ('MAT-FOAM',  'Foam padding',        'm',   120),
    ('MAT-FAB',   'Upholstery fabric',   'm',   120)
   ON CONFLICT (sku) DO NOTHING`,

  `INSERT INTO inventory_balances (material_id, on_hand)
    SELECT m.id, v.qty FROM materials m
    JOIN (VALUES ('MAT-OAK',420),('MAT-STEEL',310),('MAT-SCREW',95),('MAT-VARN',140),('MAT-FOAM',60),('MAT-FAB',260)) AS v(sku, qty)
      ON v.sku = m.sku
   ON CONFLICT (material_id) DO NOTHING`,

  `INSERT INTO stock_movements (material_id, delta, kind, ref_type, note)
    SELECT b.material_id, b.on_hand, 'adjust', 'seed', 'opening balance'
    FROM inventory_balances b
    WHERE NOT EXISTS (SELECT 1 FROM stock_movements s WHERE s.material_id = b.material_id)`,

  // ---- Phase 2: products/BOM, customer orders, contracts ----
  `ALTER TABLE materials ADD COLUMN IF NOT EXISTS std_cost numeric(10,2) NOT NULL DEFAULT 0`,
  `UPDATE materials m SET std_cost = v.c
     FROM (VALUES ('MAT-OAK',42.00),('MAT-STEEL',18.00),('MAT-SCREW',6.50),('MAT-VARN',24.00),('MAT-FOAM',15.00),('MAT-FAB',21.00)) AS v(sku, c)
     WHERE m.sku = v.sku AND m.std_cost = 0`,

  `CREATE TABLE IF NOT EXISTS products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku text NOT NULL UNIQUE,
    name text NOT NULL,
    revision text NOT NULL DEFAULT 'A',
    keywords text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS bom_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    assembly text NOT NULL,
    material_id uuid NOT NULL REFERENCES materials(id),
    qty_per_unit numeric(10,3) NOT NULL CHECK (qty_per_unit > 0),
    scrap_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (scrap_pct >= 0),
    sort integer NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS bom_lines_product_idx ON bom_lines (product_id, sort)`,

  `CREATE SEQUENCE IF NOT EXISTS order_ref_seq START 1001`,
  `CREATE TABLE IF NOT EXISTS customer_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ref text NOT NULL UNIQUE DEFAULT ('SO-' || nextval('order_ref_seq')),
    customer text NOT NULL DEFAULT 'Walk-in',
    product_id uuid NOT NULL REFERENCES products(id),
    qty integer NOT NULL CHECK (qty > 0),
    due_date date NOT NULL,
    priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 2),
    status text NOT NULL DEFAULT 'new'
      CHECK (status IN ('new','awaiting_stock','ready','in_production','completed','cancelled')),
    negotiation_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS customer_orders_status_idx ON customer_orders (status, created_at)`,
  `CREATE TABLE IF NOT EXISTS order_allocations (
    order_id uuid NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES materials(id),
    required integer NOT NULL CHECK (required > 0),
    reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    PRIMARY KEY (order_id, material_id),
    CONSTRAINT reserved_within_required CHECK (reserved <= required)
  )`,

  `CREATE TABLE IF NOT EXISTS contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier text NOT NULL,
    material_id uuid NOT NULL REFERENCES materials(id),
    unit_price numeric(12,2) NOT NULL CHECK (unit_price > 0),
    min_qty integer NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
    max_qty integer NOT NULL CHECK (max_qty >= 1),
    lead_time_days integer NOT NULL CHECK (lead_time_days >= 0),
    valid_from date NOT NULL,
    valid_to date NOT NULL,
    payment_terms text,
    penalty_terms text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','terminated')),
    file_name text,
    file_type text,
    file_data bytea,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT contract_dates CHECK (valid_to >= valid_from),
    CONSTRAINT contract_qty CHECK (max_qty >= min_qty)
  )`,
  `CREATE INDEX IF NOT EXISTS contracts_material_idx ON contracts (material_id, status)`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS contract_id uuid`,

  `INSERT INTO products (sku, name, keywords) VALUES
    ('FUR-TBL-01', 'Dining table', ARRAY['dining table','table','tables']),
    ('FUR-CHR-01', 'Lounge chair', ARRAY['lounge chair','chair','chairs','armchair']),
    ('FUR-SHF-01', 'Bookshelf', ARRAY['bookshelf','bookshelves','shelf','shelves'])
   ON CONFLICT (sku) DO NOTHING`,

  `INSERT INTO bom_lines (product_id, assembly, material_id, qty_per_unit, scrap_pct, sort)
    SELECT p.id, v.assembly, m.id, v.qty, v.scrap, v.sort
    FROM (VALUES
      ('FUR-TBL-01','Table top','MAT-OAK',6,3,10),
      ('FUR-TBL-01','Frame','MAT-STEEL',4,0,20),
      ('FUR-TBL-01','Frame','MAT-SCREW',0.5,2,30),
      ('FUR-TBL-01','Finish','MAT-VARN',1.5,5,40),
      ('FUR-CHR-01','Frame','MAT-OAK',3,3,10),
      ('FUR-CHR-01','Frame','MAT-STEEL',4,0,20),
      ('FUR-CHR-01','Frame','MAT-SCREW',0.25,2,30),
      ('FUR-CHR-01','Upholstery','MAT-FOAM',2,4,40),
      ('FUR-CHR-01','Upholstery','MAT-FAB',2.5,6,50),
      ('FUR-CHR-01','Finish','MAT-VARN',0.5,5,60),
      ('FUR-SHF-01','Carcass','MAT-OAK',10,3,10),
      ('FUR-SHF-01','Carcass','MAT-SCREW',1,2,20),
      ('FUR-SHF-01','Finish','MAT-VARN',2,5,30)
    ) AS v(psku, assembly, msku, qty, scrap, sort)
    JOIN products p ON p.sku = v.psku
    JOIN materials m ON m.sku = v.msku
    WHERE NOT EXISTS (SELECT 1 FROM bom_lines b WHERE b.product_id = p.id)`,

  `INSERT INTO contracts (supplier, material_id, unit_price, min_qty, max_qty, lead_time_days, valid_from, valid_to, payment_terms, penalty_terms)
    SELECT v.supplier, m.id, v.price, 1, v.maxq, v.lead, v.vfrom::date, v.vto::date,
           'Net 30', '1% of order value per late day, capped at 10%'
    FROM (VALUES
      ('Epsilon_Group','MAT-OAK',41.50,5000,9,'2026-01-01','2027-06-30'),
      ('Delta_Logistics','MAT-OAK',43.00,5000,11,'2026-01-01','2027-06-30'),
      ('Beta_Supplies','MAT-OAK',39.90,5000,14,'2025-07-01','2026-06-30'),
      ('Delta_Logistics','MAT-STEEL',17.80,3000,10,'2026-01-01','2027-06-30'),
      ('Gamma_Co','MAT-STEEL',18.90,3000,8,'2026-01-01','2027-06-30'),
      ('Epsilon_Group','MAT-SCREW',6.10,2000,7,'2026-01-01','2027-06-30'),
      ('Gamma_Co','MAT-SCREW',6.60,2000,6,'2026-01-01','2027-06-30'),
      ('Alpha_Inc','MAT-SCREW',5.90,150,12,'2026-01-01','2027-06-30'),
      ('Alpha_Inc','MAT-VARN',23.50,1000,10,'2026-01-01','2026-11-15'),
      ('Delta_Logistics','MAT-VARN',24.40,1000,9,'2026-01-01','2027-06-30'),
      ('Gamma_Co','MAT-FOAM',14.60,3000,9,'2026-01-01','2027-06-30'),
      ('Beta_Supplies','MAT-FOAM',15.40,3000,12,'2026-01-01','2027-06-30'),
      ('Epsilon_Group','MAT-FAB',20.30,3000,10,'2026-01-01','2027-06-30'),
      ('Alpha_Inc','MAT-FAB',21.90,3000,8,'2026-01-01','2027-06-30')
    ) AS v(supplier, msku, price, maxq, lead, vfrom, vto)
    JOIN materials m ON m.sku = v.msku
    WHERE NOT EXISTS (SELECT 1 FROM contracts)`,

  // ---- Phase 3: settle, recurring orders, thread-linked agent runs ----
  `ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS settled_at timestamptz`,
  // A chat thread that asks for one raw material (not a product order) points at it.
  `ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES materials(id)`,
  // ---- Phase 4: profit, daily production limit, currency ----
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price numeric(12,2)`,
  // First fill: selling price = material cost with a 40% markup, rounded to a whole unit. Editable later.
  `UPDATE products p SET sale_price = v.price
   FROM (
     SELECT b.product_id, round(sum(b.qty_per_unit * (1 + b.scrap_pct / 100) * m.std_cost) * 1.4) AS price
     FROM bom_lines b JOIN materials m ON m.id = b.material_id GROUP BY b.product_id
   ) v
   WHERE p.id = v.product_id AND p.sale_price IS NULL`,
  `ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS started_at timestamptz`,
  `UPDATE customer_orders SET started_at = coalesce(completed_at, created_at) WHERE started_at IS NULL AND status IN ('in_production', 'completed')`,
  `INSERT INTO settings (key, value) VALUES
    ('display_currency', '"USD"'::jsonb),
    ('usd_to_inr', '83'::jsonb),
    ('daily_order_limit', '5'::jsonb)
   ON CONFLICT (key) DO NOTHING`,
  `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS thread_id uuid`,
  `CREATE INDEX IF NOT EXISTS agent_runs_thread_idx ON agent_runs (thread_id, started_at)`,

  `CREATE TABLE IF NOT EXISTS recurring_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer text NOT NULL DEFAULT 'Walk-in',
    product_id uuid NOT NULL REFERENCES products(id),
    qty integer NOT NULL CHECK (qty > 0),
    every_days integer NOT NULL CHECK (every_days BETWEEN 1 AND 365),
    due_in_days integer NOT NULL CHECK (due_in_days BETWEEN 1 AND 730),
    priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 2),
    next_run date NOT NULL,
    active boolean NOT NULL DEFAULT true,
    last_order_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS recurring_id uuid`,

  // One-time: the earlier raw-material test chats move to Settled so the list starts clean.
  `WITH marker AS (
     INSERT INTO settings (key, value) VALUES ('legacy_threads_settled', 'true'::jsonb)
     ON CONFLICT (key) DO NOTHING RETURNING key
   )
   UPDATE negotiations SET settled_at = now()
   WHERE settled_at IS NULL AND item_category = 'Raw Materials' AND EXISTS (SELECT 1 FROM marker)`,
];

for (const [i, statement] of statements.entries()) {
  await sql.query(statement);
  console.log(`ok ${i + 1}/${statements.length}`);
}

const counts = await sql`
  SELECT
    (SELECT count(*)::int FROM materials) AS materials,
    (SELECT count(*)::int FROM inventory_balances) AS balances,
    (SELECT count(*)::int FROM settings) AS settings
`;
console.log(counts[0]);
