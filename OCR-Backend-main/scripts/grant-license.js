'use strict';

/**
 * One-off / admin: insert a license row per email and send the key via Resend.
 * Usage:
 *   node scripts/grant-license.js
 *   node scripts/grant-license.js a@x.com b@y.com
 *
 * Requires MYSQL_URL (or database.js default) and RESEND_API_KEY (or server default in code).
 */

const crypto = require('crypto');
const db = require('../database');
const { Resend } = require('resend');

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://resumebuilder-phi-seven.vercel.app').replace(
  /\/$/,
  '',
);
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@asdfhkll.in';
const resend = new Resend(process.env.RESEND_API_KEY || 're_iupwZHU4_8E1YnBUCqMX28BZ2UFkmqJWt');

const DEFAULT_EMAILS = [
  'bindwaljay@gmail.com',
  'ishveenkaur21205@gmail.com',
  '100taran.kaur@gmail.com',
];

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateLicenseKey() {
  const part = () => crypto.randomBytes(4).toString('hex').toUpperCase();
  return `RB-${part()}-${part()}-${part()}`;
}

async function sendLicenseKeyEmail({ email, userName }, licenseKey) {
  const safeName = escapeHtml(userName || 'there');
  const safeKey = escapeHtml(licenseKey);
  const activateUrl = `${FRONTEND_URL}/activate`;
  const textBody = [
    'Your Resume Builder license key',
    '',
    `Hi ${userName || 'there'},`,
    '',
    'Your license key is:',
    `${licenseKey}`,
    '',
    'To activate:',
    `1) Open ${activateUrl}`,
    '2) Enter the license key above',
    '3) Click "Activate on This Device"',
    '',
    'If you do not find this email in your inbox, check Spam/Promotions.',
    '',
    'This license is valid for one device.',
  ].join('\n');

  const htmlBody = `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; color: #111827;">
    <div style="padding: 22px 24px 10px;">
      <h2 style="margin: 0 0 10px; font-size: 20px; color: #111827;">Your Resume Builder license key</h2>
      <p style="margin: 0 0 14px; color: #374151; font-size: 14px;">Hi ${safeName}, here is your license key.</p>
      <p style="margin: 0 0 8px; color: #4b5563; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;">License key</p>
      <div style="margin: 0 0 16px; padding: 12px 14px; border: 1px solid #d1d5db; border-radius: 8px; background: #f9fafb;">
        <code style="font-size: 18px; letter-spacing: 1.5px; color: #111827; font-weight: 700;">${safeKey}</code>
      </div>
      <p style="margin: 0 0 10px; color: #374151; font-size: 14px;">Activate your license:</p>
      <ol style="margin: 0 0 16px; padding-left: 18px; color: #374151; font-size: 14px; line-height: 1.55;">
        <li>Open <a href="${activateUrl}" style="color: #111827;">Resume Builder Activate</a></li>
        <li>Enter this license key</li>
        <li>Click <strong>Activate on This Device</strong></li>
      </ol>
      <p style="margin: 0 0 10px; color: #6b7280; font-size: 12px;">If the email is not visible in inbox, check Spam or Promotions.</p>
    </div>
    <div style="padding: 12px 24px 18px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #6b7280; font-size: 12px;">This license is valid for one device.</p>
    </div>
  </div>`;

  await resend.emails.send({
    from: RESEND_FROM,
    to: email,
    subject: 'Your Resume Builder license key',
    text: textBody,
    html: htmlBody,
  });
}

async function main() {
  const emails =
    process.argv.length > 2 ? process.argv.slice(2).map((e) => e.trim().toLowerCase()) : DEFAULT_EMAILS;

  const invalid = emails.filter((e) => !e.includes('@'));
  if (invalid.length) {
    console.error('Invalid email(s):', invalid.join(', '));
    process.exit(1);
  }

  await db.init();
  console.log('DB:', db.getDbLabel());

  for (const email of emails) {
    const userName = email.split('@')[0];
    const licenseKey = generateLicenseKey();
    const upiRef = `MANUAL-GRANT-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;

    const info = await db.insertLicenseOrIgnore({
      licenseKey,
      upiRef,
      amount: 0,
      fromName: userName,
      vpa: email,
      issuedAt: new Date().toISOString(),
    });

    if (!info.changes) {
      console.error(`Skip (insert failed / duplicate): ${email}`);
      continue;
    }

    console.log('Registered:', email, licenseKey);

    try {
      await sendLicenseKeyEmail({ email, userName }, licenseKey);
      console.log('  Emailed OK');
    } catch (e) {
      console.error('  Email failed:', e.message || e);
      console.error('  Key for manual send:', licenseKey);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
