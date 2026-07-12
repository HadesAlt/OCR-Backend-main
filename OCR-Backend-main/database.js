'use strict';

const mysql = require('mysql2/promise');

/** Fallback if MYSQL_URL env is unset — env wins when set (e.g. Railway dashboard). */
const MYSQL_URL_IN_CODE =
  'mysql://root:FQlhdeRNbhQRevEOIogJJBPwEOqeJvEw@crossover.proxy.rlwy.net:36637/railway';

function resolveMysqlUrl() {
  const fromEnv = (process.env.MYSQL_URL || '').trim();
  if (fromEnv) return fromEnv;
  const inline = (MYSQL_URL_IN_CODE || '').trim();
  if (inline) return inline;
  return '';
}

let pool = null;

const MYSQL_LICENSES = `
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const MYSQL_PENDING = `
CREATE TABLE IF NOT EXISTS pending_payments (
  \`txnId\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`email\` VARCHAR(255) NOT NULL,
  \`userName\` VARCHAR(255) NULL,
  \`utr\` TEXT NULL,
  \`screenshotPath\` TEXT NULL,
  \`status\` VARCHAR(32) NOT NULL DEFAULT 'pending',
  \`licenseKey\` VARCHAR(64) NULL,
  \`createdAt\` VARCHAR(64) NOT NULL,
  \`expiresAt\` VARCHAR(64) NOT NULL,
  \`telegramMsgId\` BIGINT NULL,
  \`telegramBroadcasts\` TEXT NULL,
  \`paymentRoute\` VARCHAR(64) NULL,
  \`paymentAccountEmail\` VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

const MYSQL_PAYMENT_ROUTES = `
CREATE TABLE IF NOT EXISTS payment_routes (
  \`routeKey\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`displayName\` VARCHAR(128) NOT NULL,
  \`qrImagePath\` TEXT NULL,
  \`verificationMailbox\` VARCHAR(255) NOT NULL,
  \`manualVerification\` TINYINT(1) NOT NULL DEFAULT 0,
  \`active\` TINYINT(1) NOT NULL DEFAULT 1,
  \`priorityOrder\` INT NOT NULL DEFAULT 100,
  \`createdAt\` VARCHAR(64) NOT NULL,
  \`updatedAt\` VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

function parseMysqlUrl(connectionUrl) {
  const u = new URL(connectionUrl);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    database: u.pathname.replace(/^\//, '') || undefined,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
  };
}

async function initMysql(connectionUrl) {
  pool = mysql.createPool(parseMysqlUrl(connectionUrl));
  await pool.query(MYSQL_LICENSES);
  await pool.query(MYSQL_PENDING);
  await pool.query(MYSQL_PAYMENT_ROUTES);
  try {
    await pool.query('ALTER TABLE pending_payments ADD COLUMN telegramBroadcasts TEXT NULL');
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.query('ALTER TABLE pending_payments ADD COLUMN paymentRoute VARCHAR(64) NULL');
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') throw e;
  }
  try {
    await pool.query('ALTER TABLE pending_payments ADD COLUMN paymentAccountEmail VARCHAR(255) NULL');
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') throw e;
  }

  const now = new Date().toISOString();
  await pool.execute(
    `INSERT INTO payment_routes (routeKey, displayName, qrImagePath, verificationMailbox, manualVerification, active, priorityOrder, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       displayName = VALUES(displayName),
       qrImagePath = VALUES(qrImagePath),
       verificationMailbox = VALUES(verificationMailbox),
       manualVerification = VALUES(manualVerification),
       active = VALUES(active),
       priorityOrder = VALUES(priorityOrder),
       updatedAt = VALUES(updatedAt)`,
    ['samridh', 'Samridh FamPay (default)', '/upi-payment-qr.png', 'samridhjss@gmail.com', 0, 1, 10, now, now],
  );
  await pool.execute(
    `INSERT INTO payment_routes (routeKey, displayName, qrImagePath, verificationMailbox, manualVerification, active, priorityOrder, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       displayName = VALUES(displayName),
       qrImagePath = VALUES(qrImagePath),
       verificationMailbox = VALUES(verificationMailbox),
       manualVerification = VALUES(manualVerification),
       active = VALUES(active),
       priorityOrder = VALUES(priorityOrder),
       updatedAt = VALUES(updatedAt)`,
    ['gurnoor', 'Gurnoor (alternate)', '/image.png', 'gurnoorsingh11162007@gmail.com', 0, 1, 100, now, now],
  );
}

/**
 * MySQL only — set MYSQL_URL (e.g. mysql://user:pass@host:3306/dbname). Local SQLite is not used.
 */
async function init() {
  const mysqlUrl = resolveMysqlUrl();
  if (!mysqlUrl) {
    throw new Error(
      'MYSQL_URL is required. Set it to your MySQL connection string (Render/Railway/planetscale). Local SQLite has been removed.',
    );
  }
  await initMysql(mysqlUrl);
}

function getMode() {
  return 'mysql';
}

function getDbLabel() {
  return 'MySQL';
}

async function insertPending(row) {
  await pool.execute(
    `INSERT INTO pending_payments (txnId, email, userName, status, createdAt, expiresAt, paymentRoute, paymentAccountEmail)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [row.txnId, row.email, row.userName, row.createdAt, row.expiresAt, row.paymentRoute || null, row.paymentAccountEmail || null],
  );
}

async function findPending(txnId) {
  const [rows] = await pool.execute('SELECT * FROM pending_payments WHERE txnId = ? LIMIT 1', [txnId]);
  return rows[0] || null;
}

async function submitPending(row) {
  await pool.execute(
    'UPDATE pending_payments SET utr = ?, screenshotPath = ?, telegramMsgId = ?, telegramBroadcasts = ?, expiresAt = ? WHERE txnId = ?',
    [row.utr, row.screenshotPath, row.telegramMsgId, row.telegramBroadcasts ?? null, row.expiresAt, row.txnId],
  );
}

async function insertLicenseOrIgnore(row) {
  const [r] = await pool.execute(
    `INSERT IGNORE INTO licenses (licenseKey, upiRef, amount, fromName, vpa, issuedAt, deviceFingerprint, activatedAt, active)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 1)`,
    [row.licenseKey, row.upiRef, row.amount, row.fromName, row.vpa, row.issuedAt],
  );
  return { changes: r.affectedRows };
}

async function approvePending(licenseKey, txnId) {
  await pool.execute(`UPDATE pending_payments SET status = 'approved', licenseKey = ? WHERE txnId = ?`, [licenseKey, txnId]);
}

async function declinePending(txnId) {
  await pool.execute(`UPDATE pending_payments SET status = 'declined' WHERE txnId = ?`, [txnId]);
}

async function findLicenseByRef(upiRef) {
  const [rows] = await pool.execute('SELECT * FROM licenses WHERE UPPER(upiRef) = UPPER(?) LIMIT 1', [upiRef]);
  return rows[0] || null;
}

async function findLicenseByKey(licenseKey) {
  const [rows] = await pool.execute('SELECT * FROM licenses WHERE licenseKey = ? LIMIT 1', [licenseKey]);
  return rows[0] || null;
}

async function activateLicense(fp, ts, licenseKey) {
  const [r] = await pool.execute(
    'UPDATE licenses SET deviceFingerprint = ?, activatedAt = ? WHERE licenseKey = ? AND deviceFingerprint IS NULL',
    [fp, ts, licenseKey],
  );
  return { changes: r.affectedRows };
}

async function validateRow(key) {
  const [rows] = await pool.execute('SELECT active, deviceFingerprint FROM licenses WHERE licenseKey = ? LIMIT 1', [key]);
  return rows[0] || null;
}

function rowActive(row) {
  if (row == null) return false;
  return Number(row.active) === 1;
}

async function getPaymentStats() {
  const [approved] = await pool.execute("SELECT COUNT(*) AS c FROM pending_payments WHERE status = 'approved'");
  const [pending] = await pool.execute("SELECT COUNT(*) AS c FROM pending_payments WHERE status = 'pending'");
  const [declined] = await pool.execute("SELECT COUNT(*) AS c FROM pending_payments WHERE status = 'declined'");
  const [licenses] = await pool.execute('SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS totalInr FROM licenses');
  const [activated] = await pool.execute(
    'SELECT COUNT(*) AS c FROM licenses WHERE deviceFingerprint IS NOT NULL AND deviceFingerprint != ?',
    [''],
  );
  return {
    paymentsApprovedUpi: Number(approved[0].c),
    sessionsPending: Number(pending[0].c),
    sessionsDeclined: Number(declined[0].c),
    licensesIssuedTotal: Number(licenses[0].c),
    totalAmountInr: Number(licenses[0].totalInr),
    licensesActivated: Number(activated[0].c),
  };
}

async function getApprovedPaymentsTotal() {
  const [rows] = await pool.execute('SELECT COUNT(*) AS c FROM licenses');
  return Number((rows[0] && rows[0].c) || 0);
}

async function getApprovedPaymentsByDay(limit = 14) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(90, Number(limit))) : 14;
  const [rows] = await pool.execute(
    `SELECT LEFT(issuedAt, 10) AS day, COUNT(*) AS c
     FROM licenses
     GROUP BY LEFT(issuedAt, 10)
     ORDER BY day DESC
     LIMIT ?`,
    [safeLimit],
  );
  return rows.map((r) => ({ day: r.day, count: Number(r.c) || 0 }));
}

async function getApprovedPaymentsByAccount() {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(
         NULLIF(TRIM(p.paymentAccountEmail), ''),
         'unknown'
       ) AS accountEmail,
       COUNT(*) AS c
     FROM licenses l
     LEFT JOIN pending_payments p
       ON (
         UPPER(TRIM(p.utr)) = UPPER(TRIM(l.upiRef))
         OR UPPER(TRIM(p.txnId)) = UPPER(TRIM(l.upiRef))
       )
     GROUP BY COALESCE(NULLIF(TRIM(p.paymentAccountEmail), ''), 'unknown')
     ORDER BY c DESC, accountEmail ASC`,
  );
  return rows.map((r) => ({ accountEmail: r.accountEmail, count: Number(r.c) || 0 }));
}

async function listPaymentRoutes(includeInactive = false) {
  const sql = includeInactive
    ? `SELECT * FROM payment_routes ORDER BY active DESC, priorityOrder ASC, routeKey ASC`
    : `SELECT * FROM payment_routes WHERE active = 1 ORDER BY priorityOrder ASC, routeKey ASC`;
  const [rows] = await pool.query(sql);
  return rows;
}

async function getPaymentRouteByKey(routeKey) {
  const [rows] = await pool.execute('SELECT * FROM payment_routes WHERE routeKey = ? LIMIT 1', [routeKey]);
  return rows[0] || null;
}

async function upsertPaymentRoute(route) {
  const now = new Date().toISOString();
  await pool.execute(
    `INSERT INTO payment_routes (
      routeKey, displayName, qrImagePath, verificationMailbox, manualVerification, active, priorityOrder, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      displayName = VALUES(displayName),
      qrImagePath = VALUES(qrImagePath),
      verificationMailbox = VALUES(verificationMailbox),
      manualVerification = VALUES(manualVerification),
      active = VALUES(active),
      priorityOrder = VALUES(priorityOrder),
      updatedAt = VALUES(updatedAt)`,
    [
      route.routeKey,
      route.displayName,
      route.qrImagePath || null,
      route.verificationMailbox,
      route.manualVerification ? 1 : 0,
      route.active === false ? 0 : 1,
      Number.isFinite(route.priorityOrder) ? route.priorityOrder : 100,
      route.createdAt || now,
      now,
    ],
  );
}

async function setRouteManualVerification(routeKey, enabled) {
  await pool.execute(
    'UPDATE payment_routes SET manualVerification = ?, updatedAt = ? WHERE routeKey = ?',
    [enabled ? 1 : 0, new Date().toISOString(), routeKey],
  );
}

async function setRouteActive(routeKey, enabled) {
  await pool.execute(
    'UPDATE payment_routes SET active = ?, updatedAt = ? WHERE routeKey = ?',
    [enabled ? 1 : 0, new Date().toISOString(), routeKey],
  );
}

async function setRouteQrImagePath(routeKey, qrImagePath) {
  await pool.execute(
    'UPDATE payment_routes SET qrImagePath = ?, updatedAt = ? WHERE routeKey = ?',
    [qrImagePath || null, new Date().toISOString(), routeKey],
  );
}

module.exports = {
  init,
  getMode,
  getDbLabel,
  insertPending,
  findPending,
  submitPending,
  insertLicenseOrIgnore,
  approvePending,
  declinePending,
  findLicenseByRef,
  findLicenseByKey,
  activateLicense,
  validateRow,
  rowActive,
  getPaymentStats,
  getApprovedPaymentsTotal,
  getApprovedPaymentsByDay,
  getApprovedPaymentsByAccount,
  listPaymentRoutes,
  getPaymentRouteByKey,
  upsertPaymentRoute,
  setRouteManualVerification,
  setRouteActive,
  setRouteQrImagePath,
};
