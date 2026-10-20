import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const batchesPath = process.argv[2];
if (!batchesPath) {
  console.error("Usage: node scripts/seed.mjs <path-to-seed-batches.json>");
  process.exit(1);
}

const batches = JSON.parse(readFileSync(batchesPath, "utf8"));
const sql = neon(process.env.DATABASE_URL);

const before = await sql`SELECT count(*)::int AS n FROM procurement_orders`;
console.log("rows before:", before[0].n);

for (const [i, statement] of batches.entries()) {
  await sql.query(statement);
  console.log(`batch ${i + 1}/${batches.length} inserted`);
}

const after = await sql`SELECT count(*)::int AS n FROM procurement_orders`;
console.log("rows after:", after[0].n);
