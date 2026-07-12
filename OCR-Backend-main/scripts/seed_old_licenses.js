'use strict';

/**
 * One-time migration: seed the licenses table with license keys issued by the
 * old backend (extracted from the Telegram chat export) so old customers can
 * re-activate on the new backend/DB. Keys are inserted as UNUSED
 * (deviceFingerprint = NULL, activatedAt = NULL) so the customer must go to
 * /activate and enter their key again.
 *
 * Usage:
 *   $env:DATABASE_URL="postgres://user:pass@host:port/db"   (PowerShell)
 *   node scripts/seed_old_licenses.js path/to/extracted_licenses.json
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    console.error('DATABASE_URL env var is required.');
    process.exit(1);
  }

  const jsonPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '..', '..', 'extracted_licenses.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('Input JSON not found:', jsonPath);
    process.exit(1);
  }

  const entries = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${entries.length} license entries from ${jsonPath}`);

  const pool = new Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
    max: 5,
  });

  // Make sure the table exists (same DDL as database.js).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS licenses (
      "licenseKey" VARCHAR(64) PRIMARY KEY,
      "upiRef" VARCHAR(255) NOT NULL UNIQUE,
      "amount" DOUBLE PRECISION NOT NULL,
      "fromName" VARCHAR(512),
      "vpa" VARCHAR(512),
      "issuedAt" VARCHAR(64) NOT NULL,
      "deviceFingerprint" VARCHAR(64),
      "activatedAt" VARCHAR(64),
      "active" SMALLINT NOT NULL DEFAULT 1
    )`);

  let inserted = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const entry of entries) {
    const licenseKey = String(entry.key || '').trim().toUpperCase();
    const email = String(entry.email || '').trim().toLowerCase();
    if (!licenseKey || !email) { skipped++; continue; }

    const upiRef = `LEGACY-${licenseKey}`;
    try {
      const r = await pool.query(
        `INSERT INTO licenses ("licenseKey", "upiRef", "amount", "fromName", "vpa", "issuedAt", "deviceFingerprint", "activatedAt", "active")
         VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, 1)
         ON CONFLICT ("licenseKey") DO NOTHING`,
        [licenseKey, upiRef, 49, null, email, now],
      );
      if (r.rowCount > 0) inserted++; else skipped++;
    } catch (e) {
      console.error('Failed to insert', licenseKey, email, e.message);
      skipped++;
    }
  }

  console.log(`Done. Inserted: ${inserted}, skipped (dupes/invalid): ${skipped}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
