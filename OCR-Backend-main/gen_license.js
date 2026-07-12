const { Pool } = require('pg');

function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return [seg(), seg(), seg(), seg()].join('-');
}

async function main() {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    console.error('DATABASE_URL env var is required.');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
    max: 3,
  });

  const licenseKey = generateLicenseKey();
  const now = new Date().toISOString();
  const upiRef = 'MANUAL-ADMIN-' + Date.now();

  const r = await pool.query(
    `INSERT INTO licenses ("licenseKey", "upiRef", "amount", "fromName", "vpa", "issuedAt", "deviceFingerprint", "activatedAt", "active")
     VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, 1)
     ON CONFLICT ("licenseKey") DO NOTHING`,
    [licenseKey, upiRef, 49, 'Gurnoor Singh (Admin)', 'admin@manual', now]
  );

  console.log('');
  console.log('LICENSE KEY GENERATED:');
  console.log('');
  console.log('  ' + licenseKey);
  console.log('');
  console.log('  Rows inserted : ' + r.rowCount);
  console.log('  Issued at     : ' + now);
  console.log('  UPI Ref       : ' + upiRef);

  await pool.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
