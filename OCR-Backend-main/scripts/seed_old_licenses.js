'use strict';

/**
 * One-time migration: seed the licenses table with license keys issued by the
 * old backend (extracted from the Telegram chat export) so old customers can
 * re-activate on the new backend/DB. Keys are inserted as UNUSED
 * (deviceFingerprint = NULL, activatedAt = NULL) so the customer must go to
 * /activate and enter their key again.
 *
 * Usage:
 *   set MYSQL_URL=mysql://user:pass@host:port/db   (PowerShell: $env:MYSQL_URL="...")
 *   node scripts/seed_old_licenses.js path/to/extracted_licenses.json
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const mysqlUrl = (process.env.MYSQL_URL || '').trim();
  if (!mysqlUrl) {
    console.error('MYSQL_URL env var is required.');
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

  const u = new URL(mysqlUrl);
  const pool = mysql.createPool({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    database: u.pathname.replace(/^\//, ''),
    waitForConnections: true,
    connectionLimit: 5,
  });

  // Make sure the table exists (same DDL as database.js).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS licenses (
      \`licenseKey\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`upiRef\` VARCHAR(255) NOT NULL,
      \`amount\` DOUBLE NOT NULL,
      \`fromName\` VARCHAR(512) NULL,
      \`vpa\` VARCHAR(512) NULL,
      \`issuedAt\` VARCHAR(64) NOT NULL,
      \`deviceFingerprint\` VARCHAR(64) NULL,
      \`activatedAt\` VARCHAR(64) NULL,
      \`active\` TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY \`idx_upiRef\` (\`upiRef\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  let inserted = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const entry of entries) {
    const licenseKey = String(entry.key || '').trim().toUpperCase();
    const email = String(entry.email || '').trim().toLowerCase();
    if (!licenseKey || !email) { skipped++; continue; }

    const upiRef = `LEGACY-${licenseKey}`;
    try {
      const [r] = await pool.execute(
        `INSERT IGNORE INTO licenses (licenseKey, upiRef, amount, fromName, vpa, issuedAt, deviceFingerprint, activatedAt, active)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 1)`,
        [licenseKey, upiRef, 49, null, email, now],
      );
      if (r.affectedRows > 0) inserted++; else skipped++;
    } catch (e) {
      console.error('Failed to insert', licenseKey, email, e.message);
      skipped++;
    }
  }

  console.log(`Done. Inserted: ${inserted}, skipped (dupes/invalid): ${skipped}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
