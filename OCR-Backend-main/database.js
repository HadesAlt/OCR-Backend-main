'use strict';

const { Pool } = require('pg');

function resolvePgUrl() {
  const fromEnv = (process.env.DATABASE_URL || process.env.MYSQL_URL || '').trim();
  return fromEnv;
}

let pool = null;

const PG_LICENSES = `
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
)`;

const PG_PENDING = `
CREATE TABLE IF NOT EXISTS pending_payments (
  "txnId" VARCHAR(64) PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL,
  "userName" VARCHAR(255),
  "utr" TEXT,
  "screenshotPath" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "licenseKey" VARCHAR(64),
  "createdAt" VARCHAR(64) NOT NULL,
  "expiresAt" VARCHAR(64) NOT NULL,
  "telegramMsgId" BIGINT,
  "telegramBroadcasts" TEXT,
  "paymentRoute" VARCHAR(64),
  "paymentAccountEmail" VARCHAR(255)
)`;

const PG_PAYMENT_ROUTES = `
CREATE TABLE IF NOT EXISTS payment_routes (
  "routeKey" VARCHAR(64) PRIMARY KEY,
  "displayName" VARCHAR(128) NOT NULL,
  "qrImagePath" TEXT,
  "verificationMailbox" VARCHAR(255) NOT NULL,
  "manualVerification" SMALLINT NOT NULL DEFAULT 0,
  "active" SMALLINT NOT NULL DEFAULT 1,
  "priorityOrder" INT NOT NULL DEFAULT 100,
  "createdAt" VARCHAR(64) NOT NULL,
  "updatedAt" VARCHAR(64) NOT NULL
)`;

async function initPg(connectionUrl) {
  const useSsl = !/localhost|127\.0\.0\.1/.test(connectionUrl);
  pool = new Pool({
    connectionString: connectionUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 10,
  });
  await pool.query(PG_LICENSES);
  await pool.query(PG_PENDING);
  await pool.query(PG_PAYMENT_ROUTES);
  await pool.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS "telegramBroadcasts" TEXT`);
  await pool.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS "paymentRoute" VARCHAR(64)`);
  await pool.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS "paymentAccountEmail" VARCHAR(255)`);

  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO payment_routes ("routeKey", "displayName", "qrImagePath", "verificationMailbox", "manualVerification", "active", "priorityOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT ("routeKey") DO UPDATE SET
       "displayName" = EXCLUDED."displayName",
       "qrImagePath" = EXCLUDED."qrImagePath",
       "verificationMailbox" = EXCLUDED."verificationMailbox",
       "manualVerification" = EXCLUDED."manualVerification",
       "active" = EXCLUDED."active",
       "priorityOrder" = EXCLUDED."priorityOrder",
       "updatedAt" = EXCLUDED."updatedAt"`,
    ['samridh', 'Samridh FamPay (default)', '/upi-payment-qr.png', 'samridhjss@gmail.com', 0, 1, 10, now, now],
  );
  await pool.query(
    `INSERT INTO payment_routes ("routeKey", "displayName", "qrImagePath", "verificationMailbox", "manualVerification", "active", "priorityOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT ("routeKey") DO UPDATE SET
       "displayName" = EXCLUDED."displayName",
       "qrImagePath" = EXCLUDED."qrImagePath",
       "verificationMailbox" = EXCLUDED."verificationMailbox",
       "manualVerification" = EXCLUDED."manualVerification",
       "active" = EXCLUDED."active",
       "priorityOrder" = EXCLUDED."priorityOrder",
       "updatedAt" = EXCLUDED."updatedAt"`,
    ['gurnoor', 'Gurnoor (alternate)', '/image.png', 'gurnoorsingh11162007@gmail.com', 0, 1, 100, now, now],
  );
}

/**
 * PostgreSQL only — set DATABASE_URL (e.g. Render Postgres connection string).
 */
async function init() {
  const pgUrl = resolvePgUrl();
  if (!pgUrl) {
    throw new Error(
      'DATABASE_URL is required. Set it to your PostgreSQL connection string (Render Postgres, etc.).',
    );
  }
  await initPg(pgUrl);
}

function getMode() {
  return 'postgres';
}

function getDbLabel() {
  return 'PostgreSQL';
}

async function insertPending(row) {
  await pool.query(
    `INSERT INTO pending_payments ("txnId", "email", "userName", "status", "createdAt", "expiresAt", "paymentRoute", "paymentAccountEmail")
     VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)`,
    [row.txnId, row.email, row.userName, row.createdAt, row.expiresAt, row.paymentRoute || null, row.paymentAccountEmail || null],
  );
}

async function findPending(txnId) {
  const { rows } = await pool.query('SELECT * FROM pending_payments WHERE "txnId" = $1 LIMIT 1', [txnId]);
  return rows[0] || null;
}

async function submitPending(row) {
  await pool.query(
    'UPDATE pending_payments SET "utr" = $1, "screenshotPath" = $2, "telegramMsgId" = $3, "telegramBroadcasts" = $4, "expiresAt" = $5 WHERE "txnId" = $6',
    [row.utr, row.screenshotPath, row.telegramMsgId, row.telegramBroadcasts ?? null, row.expiresAt, row.txnId],
  );
}

async function insertLicenseOrIgnore(row) {
  const r = await pool.query(
    `INSERT INTO licenses ("licenseKey", "upiRef", "amount", "fromName", "vpa", "issuedAt", "deviceFingerprint", "activatedAt", "active")
     VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, 1)
     ON CONFLICT ("licenseKey") DO NOTHING`,
    [row.licenseKey, row.upiRef, row.amount, row.fromName, row.vpa, row.issuedAt],
  );
  return { changes: r.rowCount };
}

async function approvePending(licenseKey, txnId) {
  await pool.query(`UPDATE pending_payments SET "status" = 'approved', "licenseKey" = $1 WHERE "txnId" = $2`, [licenseKey, txnId]);
}

async function declinePending(txnId) {
  await pool.query(`UPDATE pending_payments SET "status" = 'declined' WHERE "txnId" = $1`, [txnId]);
}

async function findLicenseByRef(upiRef) {
  const { rows } = await pool.query('SELECT * FROM licenses WHERE UPPER("upiRef") = UPPER($1) LIMIT 1', [upiRef]);
  return rows[0] || null;
}

async function findLicenseByKey(licenseKey) {
  const { rows } = await pool.query('SELECT * FROM licenses WHERE "licenseKey" = $1 LIMIT 1', [licenseKey]);
  return rows[0] || null;
}

async function activateLicense(fp, ts, licenseKey) {
  const r = await pool.query(
    'UPDATE licenses SET "deviceFingerprint" = $1, "activatedAt" = $2 WHERE "licenseKey" = $3 AND "deviceFingerprint" IS NULL',
    [fp, ts, licenseKey],
  );
  return { changes: r.rowCount };
}

async function validateRow(key) {
  const { rows } = await pool.query('SELECT "active", "deviceFingerprint" FROM licenses WHERE "licenseKey" = $1 LIMIT 1', [key]);
  return rows[0] || null;
}

function rowActive(row) {
  if (row == null) return false;
  return Number(row.active) === 1;
}

async function getPaymentStats() {
  const approved = await pool.query("SELECT COUNT(*) AS c FROM pending_payments WHERE \"status\" = 'approved'");
  const pending = await pool.query("SELECT COUNT(*) AS c FROM pending_payments WHERE \"status\" = 'pending'");
  const declined = await pool.query("SELECT COUNT(*) AS c FROM pending_payments WHERE \"status\" = 'declined'");
  const licenses = await pool.query('SELECT COUNT(*) AS c, COALESCE(SUM("amount"), 0) AS "totalInr" FROM licenses');
  const activated = await pool.query(
    'SELECT COUNT(*) AS c FROM licenses WHERE "deviceFingerprint" IS NOT NULL AND "deviceFingerprint" != $1',
    [''],
  );
  return {
    paymentsApprovedUpi: Number(approved.rows[0].c),
    sessionsPending: Number(pending.rows[0].c),
    sessionsDeclined: Number(declined.rows[0].c),
    licensesIssuedTotal: Number(licenses.rows[0].c),
    totalAmountInr: Number(licenses.rows[0].totalInr),
    licensesActivated: Number(activated.rows[0].c),
  };
}

async function getApprovedPaymentsTotal() {
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM licenses');
  return Number((rows[0] && rows[0].c) || 0);
}

async function getApprovedPaymentsByDay(limit = 14) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(90, Number(limit))) : 14;
  const { rows } = await pool.query(
    `SELECT LEFT("issuedAt", 10) AS day, COUNT(*) AS c
     FROM licenses
     GROUP BY LEFT("issuedAt", 10)
     ORDER BY day DESC
     LIMIT $1`,
    [safeLimit],
  );
  return rows.map((r) => ({ day: r.day, count: Number(r.c) || 0 }));
}

async function getApprovedPaymentsByAccount() {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(
         NULLIF(TRIM(p."paymentAccountEmail"), ''),
         'unknown'
       ) AS "accountEmail",
       COUNT(*) AS c
     FROM licenses l
     LEFT JOIN pending_payments p
       ON (
         UPPER(TRIM(p."utr")) = UPPER(TRIM(l."upiRef"))
         OR UPPER(TRIM(p."txnId")) = UPPER(TRIM(l."upiRef"))
       )
     GROUP BY COALESCE(NULLIF(TRIM(p."paymentAccountEmail"), ''), 'unknown')
     ORDER BY c DESC, "accountEmail" ASC`,
  );
  return rows.map((r) => ({ accountEmail: r.accountEmail, count: Number(r.c) || 0 }));
}

async function listPaymentRoutes(includeInactive = false) {
  const sql = includeInactive
    ? `SELECT * FROM payment_routes ORDER BY "active" DESC, "priorityOrder" ASC, "routeKey" ASC`
    : `SELECT * FROM payment_routes WHERE "active" = 1 ORDER BY "priorityOrder" ASC, "routeKey" ASC`;
  const { rows } = await pool.query(sql);
  return rows;
}

async function getPaymentRouteByKey(routeKey) {
  const { rows } = await pool.query('SELECT * FROM payment_routes WHERE "routeKey" = $1 LIMIT 1', [routeKey]);
  return rows[0] || null;
}

async function upsertPaymentRoute(route) {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO payment_routes (
      "routeKey", "displayName", "qrImagePath", "verificationMailbox", "manualVerification", "active", "priorityOrder", "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT ("routeKey") DO UPDATE SET
      "displayName" = EXCLUDED."displayName",
      "qrImagePath" = EXCLUDED."qrImagePath",
      "verificationMailbox" = EXCLUDED."verificationMailbox",
      "manualVerification" = EXCLUDED."manualVerification",
      "active" = EXCLUDED."active",
      "priorityOrder" = EXCLUDED."priorityOrder",
      "updatedAt" = EXCLUDED."updatedAt"`,
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
  await pool.query(
    'UPDATE payment_routes SET "manualVerification" = $1, "updatedAt" = $2 WHERE "routeKey" = $3',
    [enabled ? 1 : 0, new Date().toISOString(), routeKey],
  );
}

async function setRouteActive(routeKey, enabled) {
  await pool.query(
    'UPDATE payment_routes SET "active" = $1, "updatedAt" = $2 WHERE "routeKey" = $3',
    [enabled ? 1 : 0, new Date().toISOString(), routeKey],
  );
}

async function setRouteQrImagePath(routeKey, qrImagePath) {
  await pool.query(
    'UPDATE payment_routes SET "qrImagePath" = $1, "updatedAt" = $2 WHERE "routeKey" = $3',
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
