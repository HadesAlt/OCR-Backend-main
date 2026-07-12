'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('./database');
const { findFamAppReceiptForUtr } = require('./gmailFamApp');
const TelegramBot = require('node-telegram-bot-api');
const { Resend } = require('resend');

const PORT = process.env.PORT || 3001;
/** Public site (license email links, CORS). Override with FRONTEND_URL=http://localhost:5173 when testing API + local UI. */
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://resumebuilder-phi-seven.vercel.app').replace(/\/$/, '');
const EXPECTED_AMOUNT = 49;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const STATS_SECRET = process.env.ADMIN_STATS_SECRET || process.env.WEBHOOK_SECRET;

const PAYMENT_EXPIRY_MINS = parseInt(process.env.PAYMENT_EXPIRY_MINS || '15', 10);
/** After user submits UTR, extend DB expiry so verification is not blocked by the QR window (days). */
const PENDING_VERIFICATION_GRACE_DAYS = parseInt(process.env.PENDING_VERIFICATION_GRACE_DAYS || '7', 10);

// ── Telegram: notifications; manual review only for routes with manualVerification (Approve/Decline). ──
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '8028942300:AAF-3F-LZGKXKBjCmA9zoHyQf6W7g0ZC59U').trim();
const TELEGRAM_NOTIFY = process.env.TELEGRAM_NOTIFY !== '0' && process.env.TELEGRAM_NOTIFY !== 'false';
const TELEGRAM_POLLING = process.env.TELEGRAM_POLLING !== '0' && process.env.TELEGRAM_POLLING !== 'false';
const QR_UPLOAD_DIR = path.join('uploads', 'route-qrs');

function parseNotifyChatIds() {
  const multi = (process.env.TELEGRAM_ADMIN_CHATS || '').trim();
  if (multi) {
    return multi.split(/[\s,]+/).map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
  }
  if (process.env.TELEGRAM_ADMIN_CHAT) {
    return [Number(process.env.TELEGRAM_ADMIN_CHAT)].filter((n) => !Number.isNaN(n));
  }
  return [8207229423, 1797759358];
}
const NOTIFY_CHAT_IDS = parseNotifyChatIds();

/** Telegram user IDs allowed to run /commands and Approve/Decline (not the same as chat IDs). */
function parseTelegramAdminUserIds() {
  const multi = (process.env.TELEGRAM_ADMIN_IDS || '').trim();
  if (multi) {
    return multi.split(/[\s,]+/).map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
  }
  return [8207229423, 1797759358];
}
const TELEGRAM_ADMIN_USER_IDS = new Set(parseTelegramAdminUserIds());

const tgNotifyBot = TELEGRAM_BOT_TOKEN ? new TelegramBot(TELEGRAM_BOT_TOKEN, TELEGRAM_POLLING ? { polling: true } : undefined) : null;
const pendingQrUploadByChat = new Map();

const SAMRIDH_UPI_ID = (process.env.SAMRIDH_UPI_ID || 'samridhjss@oksbi').trim();
const SAMRIDH_QR_LOCAL = path.join(__dirname, 'assets', 'samridh-upi-qr.png');

function telegramPhotoStreamOptionsForPath(absPath) {
  const ext = (path.extname(absPath) || '').toLowerCase();
  const contentType =
    ext === '.png' ? 'image/png' :
    ext === '.webp' ? 'image/webp' :
    ext === '.gif' ? 'image/gif' :
    'image/jpeg';
  return { filename: path.basename(absPath) || 'photo.jpg', contentType };
}

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeRouteKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function normalizeManualMode(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'on' || s === 'true' || s === '1') return true;
  if (s === 'off' || s === 'false' || s === '0') return false;
  return null;
}

function parseTelegramBroadcasts(row) {
  if (!row) return [];
  const raw = row.telegramBroadcasts;
  if (raw == null || raw === '') return [];
  const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  try {
    const data = JSON.parse(str);
    if (!Array.isArray(data)) return [];
    return data.filter((x) => x && typeof x.chatId === 'number' && typeof x.messageId === 'number');
  } catch {
    return [];
  }
}

async function editTelegramPaymentMessages(row, text) {
  if (!tgNotifyBot) return;
  const keyboardOff = { reply_markup: { inline_keyboard: [] } };
  const list = parseTelegramBroadcasts(row);
  const editOne = async (chat_id, message_id) => {
    const form = {
      chat_id,
      message_id,
      parse_mode: 'HTML',
      ...keyboardOff,
    };
    await tgNotifyBot.editMessageCaption(text, form).catch(() =>
      tgNotifyBot.editMessageText(text, form).catch(() => { }),
    );
  };
  if (list.length) {
    for (const b of list) {
      await editOne(b.chatId, b.messageId);
    }
    return;
  }
  if (row.telegramMsgId) {
    await editOne(Number(NOTIFY_CHAT_IDS[0] || 0), row.telegramMsgId);
  }
}

function formatRouteLineForTelegram(paymentRoute) {
  const r = String(paymentRoute || '').toLowerCase();
  if (r === 'samridh') return 'Samridh FamPay (default)';
  if (r === 'gurnoor') return 'Gurnoor (alternate)';
  return escapeHtml(r || '—');
}

/** Readable admin alert for Gmail auto-approve (Telegram HTML subset). */
function formatTelegramGmailApprovedMessage({
  txnId,
  utr,
  email,
  licenseKey,
  paymentRoute,
  paymentAccountEmail,
}) {
  const rawEmail = String(email || '').trim();
  const em = escapeHtml(rawEmail);
  const mailto = rawEmail ? `mailto:${encodeURIComponent(rawEmail)}` : '';
  const emailLine = mailto
    ? `📧 <a href="${mailto}">${em}</a>`
    : `📧 ${em}`;
  const t = escapeHtml(txnId);
  const u = escapeHtml(utr);
  const k = escapeHtml(licenseKey);
  const receiverRaw = String(paymentAccountEmail || paymentAccountForRoute(paymentRoute) || '').trim();
  const receiver = escapeHtml(receiverRaw || '—');
  const receiverMailto = receiverRaw ? `mailto:${encodeURIComponent(receiverRaw)}` : '';
  const receiverLine = receiverMailto
    ? `📥 <a href="${receiverMailto}">${receiver}</a>`
    : `📥 ${receiver}`;
  const route = formatRouteLineForTelegram(paymentRoute);
  return (
    `✅ <b>Payment Verified</b>\n` +
    `<i>Resume Builder</i> · <b>₹${EXPECTED_AMOUNT}</b> · Gmail + FamApp auto-check\n\n` +
    `<b>Session ID</b>\n` +
    `<code>${t}</code>\n\n` +
    `<b>Receiving account</b>\n` +
    `${receiverLine}\n` +
    `🧭 Route: ${route}\n\n` +
    `<b>Bank UTR</b>\n` +
    `<code>${u}</code>\n\n` +
    `<b>Customer</b>\n` +
    `${emailLine}\n\n` +
    `<b>License key</b>\n` +
    `<code>${k}</code>\n\n` +
    `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n` +
    (mailto
      ? `<i>License emailed · tap address above to reply</i>`
      : `<i>License emailed to customer</i>`)
  );
}

/** Admin alert when a payment session is created (helps detect QR failures before submit). */
function formatTelegramPaymentInitiatedMessage({ txnId, email, expiresAt, paymentRoute, paymentAccountEmail }) {
  const rawEmail = String(email || '').trim();
  const em = escapeHtml(rawEmail);
  const mailto = rawEmail ? `mailto:${encodeURIComponent(rawEmail)}` : '';
  const emailLine = mailto
    ? `📧 <a href="${mailto}">${em}</a>`
    : `📧 ${em}`;
  const t = escapeHtml(txnId);
  const exp = escapeHtml(expiresAt || '—');
  const route = formatRouteLineForTelegram(paymentRoute);
  const receiverRaw = String(paymentAccountEmail || paymentAccountForRoute(paymentRoute) || '').trim();
  const receiver = escapeHtml(receiverRaw || '—');
  const receiverMailto = receiverRaw ? `mailto:${encodeURIComponent(receiverRaw)}` : '';
  const receiverLine = receiverMailto
    ? `📥 <a href="${receiverMailto}">${receiver}</a>`
    : `📥 ${receiver}`;
  return (
    `🟡 <b>Payment Started</b>\n` +
    `<i>Resume Builder</i> · <b>₹${EXPECTED_AMOUNT}</b> pending verification\n\n` +
    `<b>Session ID</b>\n` +
    `<code>${t}</code>\n\n` +
    `<b>Receiving account</b>\n` +
    `${receiverLine}\n` +
    `🧭 Route: ${route}\n\n` +
    `<b>Customer</b>\n` +
    `${emailLine}\n\n` +
    `<b>Expires at</b>\n` +
    `<code>${exp}</code>\n\n` +
    `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n` +
    `<i>Created at initiate-payment step</i>`
  );
}

/** Fire-and-forget admin notifications when Gmail verifies a payment (not used for verification). */
async function notifyTelegramGmailApproved(payload) {
  if (!TELEGRAM_NOTIFY || !tgNotifyBot || !NOTIFY_CHAT_IDS.length) return;
  const text = formatTelegramGmailApprovedMessage(payload);
  const opts = {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  for (const chatId of NOTIFY_CHAT_IDS) {
    try {
      await tgNotifyBot.sendMessage(chatId, text, opts);
    } catch (e) {
      log('telegram', `notify failed chat=${chatId}`, e.message);
    }
  }
}

/** Fire-and-forget admin notifications when user starts payment (QR step). */
async function notifyTelegramPaymentInitiated(payload) {
  if (!TELEGRAM_NOTIFY || !tgNotifyBot || !NOTIFY_CHAT_IDS.length) return;
  const text = formatTelegramPaymentInitiatedMessage(payload);
  const opts = {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  for (const chatId of NOTIFY_CHAT_IDS) {
    try {
      await tgNotifyBot.sendMessage(chatId, text, opts);
    } catch (e) {
      log('telegram', `initiate notify failed chat=${chatId}`, e.message);
    }
  }
}

// ── Resend Email ──
const resend = new Resend(process.env.RESEND_API_KEY || 're_iupwZHU4_8E1YnBUCqMX28BZ2UFkmqJWt');

const GMAIL_VERIFY_ENABLED = process.env.GMAIL_VERIFY !== '0' && process.env.GMAIL_VERIFY !== 'false';
/** Optional: require FamApp receipt text to include session PAY… (UPI note). Default off — verify by UTR + ₹ only. Set GMAIL_STRICT_TXN_REF=1 to enable. */
const GMAIL_STRICT_TXN_REF = process.env.GMAIL_STRICT_TXN_REF === '1' || process.env.GMAIL_STRICT_TXN_REF === 'true';
const PAYMENT_ROUTE = {
  PRIMARY: 'samridh',
  FALLBACK: 'gurnoor',
};
const PRIMARY_PAYMENT_ACCOUNT_EMAIL = 'samridhjss@gmail.com';
const FALLBACK_PAYMENT_ACCOUNT_EMAIL = 'gurnoorsingh11162007@gmail.com';

function normalizePaymentRoute(input) {
  const route = String(input || '').trim().toLowerCase();
  if (route === PAYMENT_ROUTE.FALLBACK) return PAYMENT_ROUTE.FALLBACK;
  return PAYMENT_ROUTE.PRIMARY;
}

function paymentAccountForRoute(route) {
  return route === PAYMENT_ROUTE.FALLBACK
    ? FALLBACK_PAYMENT_ACCOUNT_EMAIL
    : PRIMARY_PAYMENT_ACCOUNT_EMAIL;
}

function alternatePaymentAccountEmail(accountEmail) {
  if (String(accountEmail || '').trim().toLowerCase() === FALLBACK_PAYMENT_ACCOUNT_EMAIL) {
    return PRIMARY_PAYMENT_ACCOUNT_EMAIL;
  }
  return FALLBACK_PAYMENT_ACCOUNT_EMAIL;
}

function isSamridhRoute(routeKey) {
  return String(routeKey || '').trim().toLowerCase() === PAYMENT_ROUTE.PRIMARY;
}

async function resolvePaymentRoute(requestedRouteKey) {
  const key = normalizeRouteKey(requestedRouteKey) || PAYMENT_ROUTE.FALLBACK;
  const direct = await db.getPaymentRouteByKey(key);
  if (direct && Number(direct.active) === 1) return direct;

  const activeRoutes = await db.listPaymentRoutes(false);
  if (activeRoutes.length > 0) return activeRoutes[0];

  return {
    routeKey: PAYMENT_ROUTE.FALLBACK,
    displayName: 'GurnoorFamPay',
    qrImagePath: null,
    verificationMailbox: FALLBACK_PAYMENT_ACCOUNT_EMAIL,
    manualVerification: 0,
    active: 1,
  };
}

function formatRouteSummary(routes) {
  if (!routes.length) return 'No routes configured.';
  return routes
    .map((r) => {
      const mode = Number(r.manualVerification) === 1 ? 'manual' : 'auto';
      const state = Number(r.active) === 1 ? 'active' : 'inactive';
      return `• ${r.routeKey} (${r.displayName}) | ${state} | ${mode} | ${r.verificationMailbox}`;
    })
    .join('\n');
}

function formatPaymentsDailySummary(rows) {
  if (!rows.length) return 'No approved payments found yet.';
  return rows
    .map((r) => `• ${r.day}: ${r.count}`)
    .join('\n');
}

function formatPaymentsAccountSummary(rows) {
  if (!rows.length) return 'No approved payments found yet.';
  return rows
    .map((r) => `• ${r.accountEmail}: ${r.count}`)
    .join('\n');
}

function generateLicenseKey() {
  const part = () => crypto.randomBytes(4).toString('hex').toUpperCase();
  return `RB-${part()}-${part()}-${part()}`;
}

function generateTxnId() {
  return 'PAY' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function log(tag, ...args) {
  console.log(`[${new Date().toISOString()}] [${tag}]`, ...args);
}

async function sendLicenseKeyEmail(row, licenseKey) {
  const safeName = escapeHtml(row.userName || 'there');
  const safeKey = escapeHtml(licenseKey);
  const activateUrl = `${FRONTEND_URL}/activate`;
  const textBody = [
    'Your Resume Builder license key',
    '',
    `Hi ${row.userName || 'there'},`,
    '',
    'Your payment has been verified. Your license key is:',
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
      <p style="margin: 0 0 14px; color: #374151; font-size: 14px;">Hi ${safeName}, your payment has been verified.</p>
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
    from: 'onboarding@asdfhkll.in',
    to: row.email,
    subject: 'Your Resume Builder license key',
    text: textBody,
    html: htmlBody,
  });
}

async function approvePendingAndEmail(row, txnId, upiRef) {
  const licenseKey = generateLicenseKey();
  await db.insertLicenseOrIgnore({
    licenseKey,
    upiRef,
    amount: EXPECTED_AMOUNT,
    fromName: row.userName || row.email,
    vpa: row.email,
    issuedAt: new Date().toISOString(),
  });
  await db.approvePending(licenseKey, txnId);
  try {
    await sendLicenseKeyEmail(row, licenseKey);
    log('approve', `Email sent to ${row.email} key=${licenseKey}`);
  } catch (e) {
    log('approve', 'Email error:', e.message);
  }
  return licenseKey;
}

function resolveQrImageAbsForTelegram(routeRow) {
  const key = String(routeRow.routeKey || '').toLowerCase();
  if (key === 'samridh' && fs.existsSync(SAMRIDH_QR_LOCAL)) return SAMRIDH_QR_LOCAL;
  const p = String(routeRow.qrImagePath || '');
  if (p.startsWith('/static/payment-routes/')) {
    const base = path.basename(p);
    const full = path.join(__dirname, 'uploads', 'route-qrs', base);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

async function sendManualVerificationRequest({ row, txnId, utr, routeRow, screenshotPath }) {
  if (!tgNotifyBot || !NOTIFY_CHAT_IDS.length) return [];
  const routeLabel = `${routeRow.displayName || routeRow.routeKey} (${routeRow.routeKey})`;
  const upiHint = String(routeRow.routeKey || '').toLowerCase() === 'samridh' ? SAMRIDH_UPI_ID : '';
  const lines = [
    '🛂 <b>Manual payment review</b>',
    `<b>Session:</b> <code>${escapeHtml(txnId)}</code>`,
    `<b>Customer:</b> ${escapeHtml(row.email)}`,
    `<b>UTR:</b> <code>${escapeHtml(utr)}</code>`,
    `<b>Route:</b> ${escapeHtml(routeLabel)}`,
    upiHint ? `<b>UPI ID:</b> <code>${escapeHtml(upiHint)}</code>` : '',
    `<b>Mailbox:</b> ${escapeHtml(routeRow.verificationMailbox)}`,
    `<b>User screenshot:</b> ${screenshotPath ? 'next message' : 'not provided'}`,
    '',
    'Tap <b>Approve</b> to email the license, or <b>Decline</b>.',
  ].filter(Boolean);
  const caption = lines.join('\n');
  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `approve:${txnId}` },
      { text: '❌ Decline', callback_data: `decline:${txnId}` },
    ]],
  };

  const qrAbs = resolveQrImageAbsForTelegram(routeRow);

  const broadcasts = [];
  for (const chatId of NOTIFY_CHAT_IDS) {
    try {
      let msg;
      if (qrAbs) {
        msg = await tgNotifyBot.sendPhoto(
          chatId,
          fs.createReadStream(qrAbs),
          { caption, parse_mode: 'HTML', reply_markup: keyboard },
          telegramPhotoStreamOptionsForPath(qrAbs),
        );
      } else {
        msg = await tgNotifyBot.sendMessage(chatId, caption, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      }
      broadcasts.push({ chatId, messageId: msg.message_id });
      if (screenshotPath && fs.existsSync(screenshotPath)) {
        await tgNotifyBot.sendPhoto(
          chatId,
          fs.createReadStream(screenshotPath),
          { caption: '📎 <b>Customer screenshot</b>', parse_mode: 'HTML' },
          telegramPhotoStreamOptionsForPath(screenshotPath),
        );
      }
    } catch (e) {
      log('telegram', `manual review notify failed chat=${chatId}`, e.message);
    }
  }
  return broadcasts;
}

async function handleManualDecision(action, txnId, actorId) {
  const row = await db.findPending(txnId);
  if (!row) return 'Session not found.';
  if (row.status !== 'pending') return `Session is already ${row.status}.`;

  if (action === 'approve') {
    const licenseKey = await approvePendingAndEmail(row, txnId, row.utr || txnId);
    await editTelegramPaymentMessages(
      row,
      `✅ <b>Approved</b>\nSession <code>${escapeHtml(txnId)}</code>\nLicense <code>${escapeHtml(licenseKey)}</code>\nBy admin <code>${escapeHtml(String(actorId || 'unknown'))}</code>`,
    );
    return `Approved ${txnId}. License sent to ${row.email}.`;
  }

  await db.declinePending(txnId);
  try {
    await resend.emails.send({
      from: 'onboarding@asdfhkll.in',
      to: row.email,
      subject: 'Resume Builder: payment could not be verified',
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0a0a0a;color:#fff;border-radius:12px;"><h2 style="color:#ff6666;margin:0 0 8px;">Payment not verified</h2><p style="color:#aaa;">Hi ${escapeHtml(row.userName || 'there')}, we could not verify your payment (ref: <code>${escapeHtml(txnId)}</code>).</p><p style="color:#aaa;">If you believe this is a mistake, reply with your UTR and a payment screenshot.</p></div>`,
    });
  } catch (_) { }
  await editTelegramPaymentMessages(
    row,
    `❌ <b>Declined</b>\nSession <code>${escapeHtml(txnId)}</code>\nBy admin <code>${escapeHtml(String(actorId || 'unknown'))}</code>`,
  );
  return `Declined ${txnId}.`;
}

async function downloadTelegramPhotoToRoute(photo, routeKey) {
  if (!tgNotifyBot) throw new Error('Telegram bot not available');
  if (!photo || !photo.file_id) throw new Error('No photo found in message');
  const file = await tgNotifyBot.getFile(photo.file_id);
  const token = encodeURIComponent(TELEGRAM_BOT_TOKEN);
  const filePath = file.file_path;
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download Telegram photo (${response.status})`);
  const arrayBuffer = await response.arrayBuffer();
  const ext = path.extname(filePath || '').toLowerCase() || '.jpg';
  if (!fs.existsSync(QR_UPLOAD_DIR)) fs.mkdirSync(QR_UPLOAD_DIR, { recursive: true });
  const base = `${routeKey}-${Date.now()}${ext}`;
  const abs = path.join(QR_UPLOAD_DIR, base);
  fs.writeFileSync(abs, Buffer.from(arrayBuffer));
  return { absPath: abs, publicPath: `/static/payment-routes/${base}` };
}

async function handleTelegramTextCommand(msg) {
  if (!tgNotifyBot) return;
  const chatId = msg.chat.id;
  const fromId = msg.from && msg.from.id;
  const text = String(msg.text || '').trim();
  if (!text.startsWith('/')) return;
  if (!TELEGRAM_ADMIN_USER_IDS.has(Number(fromId))) {
    await tgNotifyBot.sendMessage(chatId, 'You are not allowed to run admin commands.');
    return;
  }

  const parts = text.split(/\s+/);
  const cmdRaw = parts[0].toLowerCase();
  const cmd = cmdRaw.split('@')[0];

  if (cmd === '/routes') {
    const routes = await db.listPaymentRoutes(true);
    await tgNotifyBot.sendMessage(chatId, `Configured payment routes:\n\n${formatRouteSummary(routes)}`);
    return;
  }

  if (cmd === '/manual') {
    const routeKey = normalizeRouteKey(parts[1]);
    const mode = normalizeManualMode(parts[2]);
    if (!routeKey || mode == null) {
      await tgNotifyBot.sendMessage(chatId, 'Usage: /manual <routeKey> on|off');
      return;
    }
    await db.setRouteManualVerification(routeKey, mode);
    await tgNotifyBot.sendMessage(chatId, `Manual verification for ${routeKey} is now ${mode ? 'ON' : 'OFF'}.`);
    return;
  }

  if (cmd === '/route') {
    const routeKey = normalizeRouteKey(parts[1]);
    const mode = normalizeManualMode(parts[2]);
    if (!routeKey || mode == null) {
      await tgNotifyBot.sendMessage(chatId, 'Usage: /route <routeKey> on|off');
      return;
    }
    await db.setRouteActive(routeKey, mode);
    await tgNotifyBot.sendMessage(chatId, `Route ${routeKey} is now ${mode ? 'ACTIVE' : 'INACTIVE'}.`);
    return;
  }

  if (cmd === '/add' && parts[1] && parts[1].toLowerCase() === 'qr') {
    const routeKey = normalizeRouteKey(parts[2]);
    const displayName = (parts[3] || '').trim();
    const mailbox = (parts[4] || '').trim().toLowerCase();
    const manualMode = normalizeManualMode(parts[5]);
    if (!routeKey || !displayName || !mailbox) {
      await tgNotifyBot.sendMessage(chatId, 'Usage: /add qr <routeKey> <displayNameNoSpaces> <gmail> [on|off]');
      return;
    }
    await db.upsertPaymentRoute({
      routeKey,
      displayName,
      verificationMailbox: mailbox,
      manualVerification: manualMode === null ? false : manualMode,
      active: true,
      priorityOrder: 100,
    });
    pendingQrUploadByChat.set(chatId, routeKey);
    await tgNotifyBot.sendMessage(
      chatId,
      `Route ${routeKey} saved. Send the QR photo in this chat now; I will attach it to this route.`,
    );
    return;
  }

  if (cmd === '/setqr') {
    const routeKey = normalizeRouteKey(parts[1]);
    if (!routeKey) {
      await tgNotifyBot.sendMessage(chatId, 'Usage: /setqr <routeKey> then send a photo.');
      return;
    }
    pendingQrUploadByChat.set(chatId, routeKey);
    await tgNotifyBot.sendMessage(chatId, `Ready to update QR for ${routeKey}. Send the photo now.`);
    return;
  }

  if (cmd === '/payments_total') {
    const total = await db.getApprovedPaymentsTotal();
    const amount = total * EXPECTED_AMOUNT;
    await tgNotifyBot.sendMessage(
      chatId,
      `Approved payments total: ${total}\nApprox revenue (@₹${EXPECTED_AMOUNT} each): ₹${amount}`,
    );
    return;
  }

  if (cmd === '/payments_daily' || cmd === '/paymentsdaily') {
    const daysRaw = Number(parts[1]);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(90, daysRaw)) : 14;
    const rows = await db.getApprovedPaymentsByDay(days);
    await tgNotifyBot.sendMessage(
      chatId,
      `Approved payments day-wise (last ${days} days):\n\n${formatPaymentsDailySummary(rows)}`,
    );
    return;
  }

  if (cmd === '/payments_accounts') {
    const rows = await db.getApprovedPaymentsByAccount();
    await tgNotifyBot.sendMessage(
      chatId,
      `Approved payments by receiving account:\n\n${formatPaymentsAccountSummary(rows)}`,
    );
    return;
  }

  await tgNotifyBot.sendMessage(
    chatId,
    [
      'Unknown command.',
      'Available:',
      '/routes',
      '/manual <routeKey> on|off',
      '/route <routeKey> on|off',
      '/add qr <routeKey> <displayNameNoSpaces> <gmail> [on|off]',
      '/setqr <routeKey>',
      '/payments_total',
      '/payments_daily [days]',
      '/payments_accounts',
    ].join('\n'),
  );
}

async function handleTelegramPhotoMessage(msg) {
  if (!tgNotifyBot) return;
  const chatId = msg.chat.id;
  const fromId = msg.from && msg.from.id;
  if (!TELEGRAM_ADMIN_USER_IDS.has(Number(fromId))) return;

  const routeKey = pendingQrUploadByChat.get(chatId);
  if (!routeKey) return;
  const photos = Array.isArray(msg.photo) ? msg.photo : [];
  if (!photos.length) return;
  const best = photos[photos.length - 1];
  try {
    const saved = await downloadTelegramPhotoToRoute(best, routeKey);
    await db.setRouteQrImagePath(routeKey, saved.publicPath);
    pendingQrUploadByChat.delete(chatId);
    await tgNotifyBot.sendMessage(chatId, `QR updated for ${routeKey}. Public path: ${saved.publicPath}`);
  } catch (e) {
    await tgNotifyBot.sendMessage(chatId, `Could not save QR for ${routeKey}: ${e.message}`);
  }
}

async function handleTelegramCallback(cq) {
  if (!tgNotifyBot) return;
  const fromId = cq.from && cq.from.id;
  if (!TELEGRAM_ADMIN_USER_IDS.has(Number(fromId))) {
    await tgNotifyBot.answerCallbackQuery(cq.id, { text: 'Not authorized.', show_alert: true }).catch(() => { });
    return;
  }
  const [action, txnId] = String(cq.data || '').split(':');
  if (!txnId || (action !== 'approve' && action !== 'decline')) {
    await tgNotifyBot.answerCallbackQuery(cq.id, { text: 'Invalid action.', show_alert: true }).catch(() => { });
    return;
  }
  const result = await handleManualDecision(action, txnId, fromId);
  await tgNotifyBot.answerCallbackQuery(cq.id, { text: result }).catch(() => { });
}

function setupTelegramPollingHandlers() {
  if (!tgNotifyBot || !TELEGRAM_POLLING) return;
  tgNotifyBot.on('message', (msg) => {
    if (msg.text) {
      handleTelegramTextCommand(msg).catch((e) => log('telegram', 'command handler error', e.message));
      return;
    }
    if (msg.photo) {
      handleTelegramPhotoMessage(msg).catch((e) => log('telegram', 'photo handler error', e.message));
    }
  });
  tgNotifyBot.on('callback_query', (cq) => {
    handleTelegramCallback(cq).catch((e) => log('telegram', 'callback handler error', e.message));
  });
}

/* ═══════════════════════════════════════════════════
   Express App
   ═══════════════════════════════════════════════════ */
const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const origin = req.get('origin') || req.get('referer') || '(no origin)';
  log('http', `${req.method} ${req.path}`, origin);
  next();
});

// Multer — PDF OCR uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// Multer — payment screenshots
const paymentUpload = multer({
  dest: 'uploads/payments/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync(path.join('uploads', 'payments'))) fs.mkdirSync(path.join('uploads', 'payments'), { recursive: true });
if (!fs.existsSync(QR_UPLOAD_DIR)) fs.mkdirSync(QR_UPLOAD_DIR, { recursive: true });
if (!fs.existsSync('output')) fs.mkdirSync('output');
app.use('/static/payment-routes', express.static(QR_UPLOAD_DIR));

/* ── Rate limiters ── */
const getLicenseLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many requests. Please wait a few minutes.' } });
const activateLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Too many activation attempts. Try again in an hour.' } });
const validateLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { error: 'Too many requests.' } });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many webhook calls.' } });
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 15, message: { error: 'Too many requests. Slow down.' } });
const statsLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many stats requests.' } });

/* ═══════════════════════════════════════════════════
   MANUAL UPI PAYMENT ROUTES
   ═══════════════════════════════════════════════════ */

/**
 * POST /api/initiate-payment
 * Body: { email, userName }
 * Returns: { txnId, expiresAt } — UPI address lives in the site QR only, not in API.
 */
app.post('/api/initiate-payment', paymentLimiter, async (req, res) => {
  const { email, userName = '', paymentRoute: paymentRouteRaw } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required.' });
  const routeRow = await resolvePaymentRoute(paymentRouteRaw);
  const paymentRoute = routeRow.routeKey;
  const selectedPaymentAccountEmail = isSamridhRoute(paymentRoute)
    ? PRIMARY_PAYMENT_ACCOUNT_EMAIL
    : (routeRow.verificationMailbox || paymentAccountForRoute(paymentRoute));

  const txnId = generateTxnId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAYMENT_EXPIRY_MINS * 60 * 1000);

  try {
    await db.insertPending({
      txnId,
      email: email.trim(),
      userName: userName.trim(),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      paymentRoute,
      paymentAccountEmail: selectedPaymentAccountEmail,
    });
  } catch (e) {
    log('initiate-payment', e.message);
    return res.status(500).json({ error: 'Database error.' });
  }
  log(
    'payment',
    `Started payment session ${txnId} for ${email.trim()}. Route: ${paymentRoute}. Primary verification mailbox: ${selectedPaymentAccountEmail}.`,
  );
  notifyTelegramPaymentInitiated({
    txnId,
    email: email.trim(),
    userName: userName.trim(),
    expiresAt: expiresAt.toISOString(),
    paymentRoute,
    paymentAccountEmail: selectedPaymentAccountEmail,
  }).catch((e) => log('telegram', 'initiate notify error:', e.message));
  return res.json({
    txnId,
    expiresAt: expiresAt.toISOString(),
    paymentRoute,
    paymentAccountEmail: selectedPaymentAccountEmail,
  });
});

/**
 * POST /api/submit-payment  (multipart/form-data)
 * Fields: txnId, utr  |  optional file: screenshot
 */
app.post('/api/submit-payment', paymentLimiter, paymentUpload.single('screenshot'), async (req, res) => {
  const { txnId, utr } = req.body;
  if (!txnId || !utr) return res.status(400).json({ error: 'txnId and UTR are required.' });

  const row = await db.findPending(txnId);
  if (!row) return res.status(404).json({ error: 'Payment session not found. Please start again.' });
  if (row.status !== 'pending') return res.status(400).json({ error: `Payment already ${row.status}.` });
  if (new Date() > new Date(row.expiresAt)) {
    return res.status(410).json({ error: 'Payment window has expired. Please start a new payment.' });
  }
  const routeRow = await resolvePaymentRoute(row.paymentRoute || PAYMENT_ROUTE.FALLBACK);
  const paymentRoute = routeRow.routeKey;
  const selectedPaymentAccountEmail = isSamridhRoute(paymentRoute)
    ? PRIMARY_PAYMENT_ACCOUNT_EMAIL
    : (routeRow.verificationMailbox || row.paymentAccountEmail || paymentAccountForRoute(paymentRoute));

  const screenshotPath = req.file ? req.file.path : null;
  const utrTrim = utr.trim();

  log(
    'payment',
    `Received payment submission for session ${txnId} from ${row.email}. UTR: ${utrTrim}. Route: ${paymentRoute}. First mailbox: ${selectedPaymentAccountEmail}. Screenshot attached: ${screenshotPath ? 'yes' : 'no'}.`,
  );

  const extendedExpiresAt = new Date(
    Date.now() + PENDING_VERIFICATION_GRACE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const verifyFailMessage = {
    gmail_not_configured:
      'Automatic verification is not configured on the server. Please contact support.',
    txn_not_in_receipt:
      'We found a payment, but the receipt does not include this session ID. Add the PAY… code from the payment screen to your UPI payment note and try again.',
    no_matching_receipt:
      'We could not verify this payment in email yet. Check the UTR, ensure the amount is ₹49, and try again in a minute.',
    gmail_disabled: 'Automatic verification is turned off. Please contact support.',
    verify_error: 'Verification failed temporarily. Please try again.',
  };

  let failReason = 'no_matching_receipt';
  let finalVerifiedMailbox = selectedPaymentAccountEmail;

  const manualVerificationEnabled = Number(routeRow.manualVerification) === 1 && !isSamridhRoute(paymentRoute);
  if (manualVerificationEnabled) {
    const broadcasts = await sendManualVerificationRequest({
      row,
      txnId,
      utr: utrTrim,
      routeRow,
      screenshotPath,
    });
    const firstMsgId = broadcasts[0] ? broadcasts[0].messageId : null;
    const broadcastJson = broadcasts.length ? JSON.stringify(broadcasts) : null;
    await db.submitPending({
      utr: utrTrim,
      screenshotPath,
      telegramMsgId: firstMsgId,
      telegramBroadcasts: broadcastJson,
      expiresAt: extendedExpiresAt,
      txnId,
    });
    log('payment', `Session ${txnId} moved to manual verification via route ${paymentRoute}.`);
    return res.status(202).json({
      success: true,
      verifiedBy: 'manual',
      pendingManualReview: true,
      paymentRoute,
    });
  } else if (!GMAIL_VERIFY_ENABLED) {
    log('payment', 'Automatic Gmail verification is disabled (GMAIL_VERIFY=0), so this submission is being rejected.');
    failReason = 'gmail_disabled';
  } else {
    try {
      log('payment', `Checking mailbox ${selectedPaymentAccountEmail} for matching FamApp receipt.`);
      const primaryVerify = await findFamAppReceiptForUtr(
        utrTrim,
        EXPECTED_AMOUNT,
        GMAIL_STRICT_TXN_REF ? txnId : null,
        selectedPaymentAccountEmail,
      );
      const primarySummary = primaryVerify.ok
        ? `Match found in ${selectedPaymentAccountEmail}.`
        : `No match in ${selectedPaymentAccountEmail}. Reason: ${primaryVerify.reason || 'not provided'}.`;
      log('payment', primarySummary);
      let verify = primaryVerify;

      if (!verify.ok) {
        const fallbackMailbox = alternatePaymentAccountEmail(selectedPaymentAccountEmail);
        log('payment', `Trying fallback mailbox ${fallbackMailbox} before rejecting this submission.`);
        const secondVerify = await findFamAppReceiptForUtr(
          utrTrim,
          EXPECTED_AMOUNT,
          GMAIL_STRICT_TXN_REF ? txnId : null,
          fallbackMailbox,
        );
        const fallbackSummary = secondVerify.ok
          ? `Match found in fallback mailbox ${fallbackMailbox}.`
          : `No match in fallback mailbox ${fallbackMailbox}. Reason: ${secondVerify.reason || 'not provided'}.`;
        log('payment', fallbackSummary);
        if (secondVerify.ok) {
          verify = secondVerify;
          finalVerifiedMailbox = fallbackMailbox;
        }
      }

      if (verify.ok) {
        await db.submitPending({
          utr: utrTrim,
          screenshotPath,
          telegramMsgId: null,
          telegramBroadcasts: null,
          expiresAt: extendedExpiresAt,
          txnId,
        });
        const licenseKey = await approvePendingAndEmail(row, txnId, utrTrim);
        await notifyTelegramGmailApproved({
          txnId,
          utr: utrTrim,
          email: row.email,
          userName: row.userName,
          licenseKey,
          paymentRoute,
          paymentAccountEmail: finalVerifiedMailbox,
        });
        log(
          'payment',
          `Payment verified for session ${txnId}. License issued and emailed to ${row.email}. Verified using mailbox ${finalVerifiedMailbox}.`,
        );
        return res.json({
          success: true,
          verifiedBy: 'gmail',
          licenseKey,
          paymentRoute,
          paymentAccountEmail: finalVerifiedMailbox,
        });
      }
      failReason = verify.reason || 'no_matching_receipt';
      if (verify.reason === 'gmail_not_configured') {
        log('payment', 'Gmail is not configured on the server. Add credentials/token files or set GMAIL_* environment variables.');
      } else if (verify.reason === 'txn_not_in_receipt') {
        log('payment', 'UTR and amount matched, but strict session reference validation failed.');
      } else {
        log('payment', `Gmail could not confirm this payment for ₹${EXPECTED_AMOUNT} in either mailbox.`);
      }
    } catch (e) {
      failReason = 'verify_error';
      log('payment', `Gmail verification failed with an internal error: ${e.message}`);
    }
  }

  await db.submitPending({
    utr: utrTrim,
    screenshotPath,
    telegramMsgId: null,
    telegramBroadcasts: null,
    expiresAt: extendedExpiresAt,
    txnId,
  });

  const msg = verifyFailMessage[failReason] || verifyFailMessage.no_matching_receipt;
  log('payment', `Payment for session ${txnId} was rejected. Reason: ${failReason}.`);
  return res.status(422).json({ error: msg });
});

app.get('/api/payment-routes', async (_req, res) => {
  try {
    const rows = await db.listPaymentRoutes(false);
    const data = rows.map((r) => ({
      routeKey: r.routeKey,
      displayName: r.displayName,
      active: Number(r.active) === 1,
      // Samridh is always auto-verified via Gmail/FamApp.
      manualVerification: Number(r.manualVerification) === 1 && !isSamridhRoute(r.routeKey),
      qrImageUrl: r.qrImagePath || null,
      upiVpa: String(r.routeKey || '').toLowerCase() === 'samridh' ? SAMRIDH_UPI_ID : null,
    }));
    return res.json({ routes: data });
  } catch (e) {
    log('payment-routes', e.message);
    return res.status(500).json({ error: 'Could not load payment routes.' });
  }
});

/**
 * POST /api/telegram-webhook — Approve/Decline callbacks when not using polling.
 */
app.post('/api/telegram-webhook', (req, res) => {
  res.sendStatus(200);
  const update = req.body;
  if (!update || !update.callback_query) return;
  handleTelegramCallback(update.callback_query).catch((e) => log('telegram', 'webhook callback error', e.message));
});

/**
 * GET /api/setup-telegram-webhook
 * - No query: delete webhook (use with TELEGRAM_POLLING=true).
 * - ?url=https://your-api.host — register webhook for Approve/Decline (use with TELEGRAM_POLLING=false).
 */
app.get('/api/setup-telegram-webhook', async (req, res) => {
  if (!tgNotifyBot) {
    return res.json({ success: false, message: 'TELEGRAM_BOT_TOKEN not set — Telegram notifications disabled.' });
  }
  const base = (req.query.url || req.query.setUrl || '').trim().replace(/\/$/, '');
  if (base) {
    try {
      const webhookUrl = `${base}/api/telegram-webhook`;
      const result = await tgNotifyBot.setWebHook(webhookUrl);
      log('telegram', `Webhook registered: ${webhookUrl}`);
      return res.json({ success: true, webhookUrl, result, mode: 'webhook' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  try {
    const result = await tgNotifyBot.deleteWebHook({ drop_pending_updates: true });
    log('telegram', 'Bot webhook cleared.');
    return res.json({
      success: true,
      message: TELEGRAM_POLLING
        ? 'Telegram webhook removed. Polling mode is active for commands and callbacks.'
        : 'Telegram webhook removed.',
      result,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════
   EXISTING ROUTES
   ═══════════════════════════════════════════════════ */

app.post('/api/payment-webhook', webhookLimiter, async (req, res) => {
  log('webhook', 'query =', JSON.stringify(req.query));
  log('webhook', 'body  =', JSON.stringify(req.body));

  if (WEBHOOK_SECRET) {
    const provided = req.query.secret || req.headers['x-webhook-secret'];
    if (!provided || provided !== WEBHOOK_SECRET) {
      log('webhook', 'REJECTED — bad secret');
      return res.status(403).json({ error: 'Forbidden' });
    }
  } else {
    log('webhook', 'WARN: WEBHOOK_SECRET not set');
  }

  const secretVerified = !!(WEBHOOK_SECRET &&
    (req.query.secret === WEBHOOK_SECRET || req.headers['x-webhook-secret'] === WEBHOOK_SECRET));
  const { referenceNumber, amount, from, vpa } = req.body;
  const ref = (referenceNumber || '').toString().trim();
  const paid = parseFloat(amount) || 0;

  if (!ref) {
    log('webhook', 'Missing referenceNumber');
    return res.status(200).json({ message: 'No reference number' });
  }

  if (secretVerified) {
    if (paid > 0 && paid !== EXPECTED_AMOUNT) {
      log('webhook', `Amount ₹${paid} !== ₹${EXPECTED_AMOUNT} — rejected`);
      return res.status(200).json({ message: 'Incorrect amount' });
    }
  } else {
    if (paid !== EXPECTED_AMOUNT) {
      log('webhook', `Unauthenticated: ₹${paid} rejected`);
      return res.status(200).json({ message: 'Incorrect amount' });
    }
  }

  const licenseKey = generateLicenseKey();
  const info = await db.insertLicenseOrIgnore({ licenseKey, upiRef: ref, amount: paid, fromName: from || null, vpa: vpa || null, issuedAt: new Date().toISOString() });

  if (info.changes === 0) {
    log('webhook', 'Duplicate ref:', ref);
    return res.status(200).json({ message: 'Already processed' });
  }

  log('webhook', 'License issued:', licenseKey, '| ref:', ref);
  return res.status(200).json({ success: true, licenseKey });
});

app.post('/api/get-license', getLicenseLimiter, async (req, res) => {
  const { upiRef } = req.body;
  log('get-license', 'Lookup:', upiRef);

  if (!upiRef || !upiRef.trim()) {
    return res.status(400).json({ error: 'UPI reference number is required.' });
  }

  const row = await db.findLicenseByRef(upiRef.trim());
  if (!row) {
    log('get-license', 'NOT FOUND:', upiRef.trim());
    return res.status(404).json({ error: 'No license found for this UPI reference. If you just paid, please wait 1–2 minutes and try again.' });
  }

  log('get-license', 'Found:', row.licenseKey, '| activated:', !!row.deviceFingerprint);
  return res.json({ licenseKey: row.licenseKey, alreadyActivated: !!row.deviceFingerprint });
});

app.post('/api/activate-license', activateLimiter, async (req, res) => {
  const { licenseKey, fingerprint } = req.body;

  if (!licenseKey || !fingerprint) {
    return res.status(400).json({ error: 'License key and device fingerprint are required.' });
  }

  const key = licenseKey.trim().toUpperCase();
  const row = await db.findLicenseByKey(key);

  if (!row) return res.status(404).json({ error: 'Invalid license key. Please check and try again.' });
  if (!db.rowActive(row)) return res.status(403).json({ error: 'This license has been deactivated.' });

  if (row.deviceFingerprint && row.deviceFingerprint !== fingerprint) {
    log('activate', 'Device mismatch:', key);
    return res.status(403).json({ error: 'This license is already activated on another device. Each license works on only 1 device.' });
  }

  if (row.deviceFingerprint === fingerprint) {
    return res.json({ success: true, message: 'License activated! Welcome to Resume Builder.' });
  }

  const result = await db.activateLicense(fingerprint, new Date().toISOString(), key);
  if (result.changes === 0) {
    const fresh = await db.findLicenseByKey(key);
    if (!fresh || fresh.deviceFingerprint !== fingerprint) {
      return res.status(403).json({ error: 'License was just activated on another device.' });
    }
  }

  log('activate', 'Activated:', key);
  return res.json({ success: true, message: 'License activated! Welcome to Resume Builder.' });
});

app.get('/api/validate-license', validateLimiter, async (req, res) => {
  const { key, fp } = req.query;
  if (!key || !fp) return res.json({ valid: false, error: 'Missing parameters' });

  const row = await db.validateRow(key.trim().toUpperCase());
  if (!row) return res.json({ valid: false, error: 'Invalid license key' });
  if (!db.rowActive(row)) return res.json({ valid: false, error: 'License deactivated' });
  if (!row.deviceFingerprint) return res.json({ valid: false, error: 'License not yet activated' });
  if (row.deviceFingerprint !== fp) return res.json({ valid: false, error: 'Wrong device' });

  return res.json({ valid: true });
});

app.post('/api/ocr', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    const inputPath = req.file.path;

    // The PDF generated by jsPDF already contains embedded text (no OCR needed).
    // Stream it straight back to the client and clean up.
    res.download(inputPath, 'resume_searchable.pdf', (err) => {
      if (err) log('ocr', 'Download error:', err.message);
      setTimeout(() => { try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (_) { } }, 5000);
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * GET /api/admin/payment-stats?secret=…  or header x-stats-secret
 * Counts + SUM(amount) from DB (all historical rows). Requires ADMIN_STATS_SECRET or WEBHOOK_SECRET.
 */
app.get('/api/admin/payment-stats', statsLimiter, async (req, res) => {
  const provided = req.query.secret || req.headers['x-stats-secret'];
  if (!STATS_SECRET || provided !== STATS_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const stats = await db.getPaymentStats();
    return res.json(stats);
  } catch (e) {
    log('stats', e.message);
    return res.status(500).json({ error: 'Could not load stats' });
  }
});

app.get('/', (_req, res) => res.json({
  status: 'ok',
  message: 'Resume Builder API',
  storage: 'MySQL',
  endpoints: {
    initiatePayment: 'POST /api/initiate-payment  { email, userName }',
    submitPayment: 'POST /api/submit-payment    (multipart: txnId, utr, screenshot?)',
    telegramWebhook: 'POST /api/telegram-webhook  (Approve/Decline callbacks when not polling)',
    setupWebhook: 'GET  /api/setup-telegram-webhook  (?url= clears or registers webhook)',
    paymentRoutes: 'GET  /api/payment-routes',
    getLicense: 'POST /api/get-license        { upiRef }',
    activate: 'POST /api/activate-license   { licenseKey, fingerprint }',
    validate: 'GET  /api/validate-license?key=&fp=',
    ocr: 'POST /api/ocr                (PDF file)',
    paymentStats: 'GET  /api/admin/payment-stats?secret=…  (ADMIN_STATS_SECRET or WEBHOOK_SECRET)',
  },
}));

(async function start() {
  try {
    await db.init();
    setupTelegramPollingHandlers();
    const server = app.listen(PORT, () => {
      log('server', `Running on port ${PORT} | DB: ${db.getDbLabel()}`);
      log('server', `FRONTEND_URL=${FRONTEND_URL}`);
      log('server', `Gmail verify: ${GMAIL_VERIFY_ENABLED ? 'ON (needs credentials in OCR-Backend-main or GMAIL_* env)' : 'OFF (GMAIL_VERIFY=0)'}`);
      log('server', `Gmail strict session ref in receipt: ${GMAIL_STRICT_TXN_REF ? 'ON (GMAIL_STRICT_TXN_REF=1)' : 'OFF (UTR + ₹49 only; set GMAIL_STRICT_TXN_REF=1 to require PAY note)'}`);
      log(
        'server',
        TELEGRAM_POLLING
          ? 'Telegram: polling mode ON (commands + callbacks + notifications).'
          : 'Telegram: polling mode OFF (notifications only).',
      );
      log('server', 'Log tags: [http] request, [payment] UPI flow, [gmail] FamApp search, [approve] license email');
      log(
        'server',
        STATS_SECRET
          ? 'Stats: GET /api/admin/payment-stats?secret=…'
          : 'Stats: set ADMIN_STATS_SECRET or WEBHOOK_SECRET for GET /api/admin/payment-stats',
      );
    });
    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(
          `[fatal] Port ${PORT} is already in use. Another node/server is listening.\n` +
            `  Fix: netstat -ano | findstr :${PORT}   then   Stop-Process -Id <PID> -Force\n` +
            `  Or use a different port: set PORT=3002 && npm start`,
        );
        process.exit(1);
      }
      throw err;
    });
  } catch (e) {
    console.error('[fatal]', e);
    process.exit(1);
  }
})();
