const mysql = require('mysql2/promise');

const MYSQL_URL = 'mysql://root:FQlhdeRNbhQRevEOIogJJBPwEOqeJvEw@crossover.proxy.rlwy.net:36637/railway';

function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return [seg(), seg(), seg(), seg()].join('-');
}

async function main() {
  const u = new URL(MYSQL_URL);
  const pool = mysql.createPool({
    host: u.hostname,
    port: Number(u.port),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    waitForConnections: true,
    connectionLimit: 3,
  });

  const licenseKey = generateLicenseKey();
  const now = new Date().toISOString();
  const upiRef = 'MANUAL-ADMIN-' + Date.now();

  const [r] = await pool.execute(
    `INSERT IGNORE INTO licenses (licenseKey, upiRef, amount, fromName, vpa, issuedAt, deviceFingerprint, activatedAt, active)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 1)`,
    [licenseKey, upiRef, 49, 'Gurnoor Singh (Admin)', 'admin@manual', now]
  );

  console.log('');
  console.log('LICENSE KEY GENERATED:');
  console.log('');
  console.log('  ' + licenseKey);
  console.log('');
  console.log('  Rows inserted : ' + r.affectedRows);
  console.log('  Issued at     : ' + now);
  console.log('  UPI Ref       : ' + upiRef);

  await pool.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
