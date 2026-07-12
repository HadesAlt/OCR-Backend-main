'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

function glog(...args) {
  console.log(`[${new Date().toISOString()}] [gmail]`, ...args);
}

function decodeBase64Url(data) {
  if (!data) return '';
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

function collectParts(payload, acc = { plain: '', html: '' }) {
  if (!payload) return acc;
  if (payload.body && payload.body.data) {
    const raw = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/plain') acc.plain += raw;
    if (payload.mimeType === 'text/html') acc.html += raw;
  }
  if (payload.parts) {
    for (const p of payload.parts) collectParts(p, acc);
  }
  return acc;
}

function sanitizeHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function textForParsing({ plain, html }) {
  const p = (plain || '').trim();
  if (p.length > 0) return p;
  return sanitizeHtmlToText(html);
}

function normalizeUtrRef(s) {
  return String(s || '').trim().replace(/\s/g, '').toUpperCase();
}

function parseFamAppReceipt(text) {
  const t = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  // Bank UTR is often digits-only; FamPay / some apps use alphanumeric (e.g. FMPIB5149373827).
  const utr =
    t.match(/UTR\s*[:\s]+\s*([A-Z0-9]{6,24})/i)?.[1] ??
    t.match(/UPI\s*Ref(?:erence)?\s*[:\s]+\s*([A-Z0-9]{6,24})/i)?.[1] ??
    null;
  const transactionId =
    t.match(/Transaction\s*ID\s*[:\s]+\s*([A-Z0-9]+)/i)?.[1] ?? null;
  let amount = null;
  const mReceived = t.match(
    /successfully\s+received\s+₹\s*([\d,]+(?:\.\d+)?)/i,
  );
  const mPaid = t.match(/successfully\s+paid\s+₹\s*([\d,]+(?:\.\d+)?)/i);
  if (mReceived) amount = mReceived[1].replace(/,/g, '');
  else if (mPaid) amount = mPaid[1].replace(/,/g, '');
  else {
    const mRupee = t.match(/₹\s*([\d,]+(?:\.\d+)?)/);
    if (mRupee) amount = mRupee[1].replace(/,/g, '');
  }
  const purposeRaw = t.match(
    /Purpose\s*[:\s]+\s*(.+?)(?:\s+If this was not|\s+Best,|\s*Disclaimer|$)/i,
  )?.[1]?.trim();
  const purpose = purposeRaw ? purposeRaw.slice(0, 200) : null;
  return { utr, transactionId, amount, purpose };
}

function extractBody(payload) {
  const { plain, html } = collectParts(payload);
  return textForParsing({ plain, html });
}

function headerFromPayload(payload, name) {
  const headers = payload && payload.headers;
  if (!headers) return '';
  const h = headers.find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
  return (h && h.value) || '';
}

function receiptContainsSessionTxn(fullText, txnId) {
  const hay = (fullText || '').toUpperCase();
  const id = String(txnId || '').trim().toUpperCase();
  if (!id || id.length < 8) return false;
  const variants = new Set([id, id.replace(/-/g, '')]);
  if (id.startsWith('PAY-')) {
    variants.add('PAY' + id.slice(4).replace(/-/g, ''));
  }
  if (id.startsWith('PAY') && !id.startsWith('PAY-') && id.length >= 11) {
    variants.add('PAY-' + id.slice(3));
  }
  for (const v of variants) {
    if (v.length < 10) continue;
    if (hay.includes(v)) return true;
  }
  return false;
}

const gmailClientCache = new Map();
const DEFAULT_GMAIL_ACCOUNT_EMAIL = 'samridhjss@gmail.com';

function accountTokenFileName(accountEmail) {
  const email = String(accountEmail || process.env.GMAIL_ACCOUNT_EMAIL || DEFAULT_GMAIL_ACCOUNT_EMAIL).trim();
  if (!email) return 'token.json';
  const safe = email.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
  return `token.${safe}.json`;
}

function resolveOAuthFilePaths(accountEmail) {
  if (process.env.GMAIL_CREDENTIALS_PATH && process.env.GMAIL_TOKEN_PATH) {
    return {
      credPath: process.env.GMAIL_CREDENTIALS_PATH,
      tokPath: process.env.GMAIL_TOKEN_PATH,
    };
  }
  const tokenFile = accountTokenFileName(accountEmail);
  const inBackend = {
    credPath: path.join(__dirname, 'credentials.json'),
    tokPath: path.join(__dirname, tokenFile),
  };
  const inParent = {
    credPath: path.join(__dirname, '..', 'credentials.json'),
    tokPath: path.join(__dirname, '..', tokenFile),
  };
  if (fs.existsSync(inBackend.credPath) && fs.existsSync(inBackend.tokPath)) {
    return inBackend;
  }
  if (fs.existsSync(inParent.credPath) && fs.existsSync(inParent.tokPath)) {
    glog('auth: using OAuth files from parent folder (Website/)');
    return inParent;
  }
  glog(
    `auth: need credentials.json + ${tokenFile} together. Checked:`,
    inBackend.credPath,
    inBackend.tokPath,
    'and',
    inParent.credPath,
    inParent.tokPath,
    '| cred backend:',
    fs.existsSync(inBackend.credPath),
    'tok backend:',
    fs.existsSync(inBackend.tokPath),
    '| cred parent:',
    fs.existsSync(inParent.credPath),
    'tok parent:',
    fs.existsSync(inParent.tokPath),
  );
  return null;
}

async function getGmail(accountEmail) {
  const normalizedAccount = String(accountEmail || process.env.GMAIL_ACCOUNT_EMAIL || DEFAULT_GMAIL_ACCOUNT_EMAIL).trim().toLowerCase();
  if (gmailClientCache.has(normalizedAccount)) return gmailClientCache.get(normalizedAccount);

  const id = process.env.GMAIL_CLIENT_ID;
  const secret = process.env.GMAIL_CLIENT_SECRET;
  const refresh = process.env.GMAIL_REFRESH_TOKEN;
  if (id && secret && refresh) {
    glog('auth: using env GMAIL_CLIENT_ID / GMAIL_REFRESH_TOKEN', `(gmailAccount=${normalizedAccount})`);
    const oauth2 = new OAuth2Client(id, secret);
    oauth2.setCredentials({ refresh_token: refresh });
    await oauth2.getAccessToken();
    const client = google.gmail({ version: 'v1', auth: oauth2 });
    gmailClientCache.set(normalizedAccount, client);
    glog('auth: Gmail API client ready (env)');
    return client;
  }

  const paths = resolveOAuthFilePaths(normalizedAccount);
  if (!paths) {
    return null;
  }
  const { credPath, tokPath } = paths;

  glog(
    'auth: using files',
    credPath,
    '+',
    tokPath,
    `(gmailAccount=${normalizedAccount || 'default-token'})`,
  );
  const keyFile = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const keys = keyFile.installed || keyFile.web;
  const oauth2 = new OAuth2Client({
    clientId: keys.client_id,
    clientSecret: keys.client_secret,
  });
  oauth2.setCredentials(JSON.parse(fs.readFileSync(tokPath, 'utf8')));
  await oauth2.getAccessToken();
  const client = google.gmail({ version: 'v1', auth: oauth2 });
  gmailClientCache.set(normalizedAccount, client);
  return client;
}

function amountMatches(parsedAmount, expected) {
  if (parsedAmount == null || parsedAmount === '') return true;
  const a = Number(parsedAmount);
  const e = Number(expected);
  if (Number.isNaN(a) || Number.isNaN(e)) return false;
  return Math.abs(a - e) < 0.01;
}

/**
 * @param {string|null} requiredTxnId - If set, email body/snippet/subject must include this session ref (e.g. PAY63B03D99).
 * @param {string|null} accountEmail - Gmail mailbox to search in.
 */
async function findFamAppReceiptForUtr(utr, expectedAmount, requiredTxnId, accountEmail) {
  const mailbox = String(accountEmail || process.env.GMAIL_ACCOUNT_EMAIL || DEFAULT_GMAIL_ACCOUNT_EMAIL).trim().toLowerCase();
  const gmail = await getGmail(mailbox);
  if (!gmail) return { ok: false, reason: 'gmail_not_configured' };

  const wantUtr = normalizeUtrRef(utr);
  glog(
    'verify: looking for UTR',
    wantUtr,
    `mailbox=${mailbox}`,
    'amount ₹' + expectedAmount,
    requiredTxnId ? `+ session ref ${requiredTxnId}` : '(session ref not required)',
  );

  const q = `from:no-reply@famapp.in ${wantUtr}`;
  let list = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults: 15,
  });

  let refs = list.data.messages || [];
  glog('verify: search q="' + q + '" →', refs.length, 'message(s)');
  if (refs.length === 0) {
    const fallbackQ = 'from:no-reply@famapp.in newer_than:14d';
    list = await gmail.users.messages.list({
      userId: 'me',
      q: fallbackQ,
      maxResults: 40,
    });
    refs = list.data.messages || [];
    glog('verify: fallback q="' + fallbackQ + '" →', refs.length, 'message(s)');
  }

  let scanned = 0;
  let sawUtrAmountMatchButWrongRef = false;
  for (const ref of refs) {
    scanned += 1;
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: ref.id,
      format: 'full',
    });
    const bodyText = extractBody(full.data.payload);
    const parsed = parseFamAppReceipt(bodyText);
    const fromUtr = normalizeUtrRef(parsed.utr);
    const fromTxn = normalizeUtrRef(parsed.transactionId);
    /** FamPay-style refs may appear only in body/snippet with odd labels — allow loose match for non–all-digit refs. */
    const looseBodyMatch =
      /[A-Z]/i.test(wantUtr) &&
      (bodyText || '').replace(/\s+/g, '').toUpperCase().includes(wantUtr);
    if (fromUtr !== wantUtr && fromTxn !== wantUtr && !looseBodyMatch) {
      continue;
    }
    if (!amountMatches(parsed.amount, expectedAmount)) {
      glog('verify: UTR matched but amount mismatch — parsed ₹' + parsed.amount + ' want ₹' + expectedAmount, 'msg', ref.id);
      continue;
    }
    if (requiredTxnId) {
      const subject = headerFromPayload(full.data.payload, 'Subject');
      const fullScan = `${bodyText}\n${full.data.snippet || ''}\n${subject}`;
      if (!receiptContainsSessionTxn(fullScan, requiredTxnId)) {
        sawUtrAmountMatchButWrongRef = true;
        glog(
          'verify: UTR+₹ OK but payment note does not include session ref',
          requiredTxnId,
          'msg',
          ref.id,
        );
        continue;
      }
    }
    glog('verify: MATCH msg', ref.id, 'parsed amount ₹' + parsed.amount, 'txn', parsed.transactionId || '—');
    return { ok: true, messageId: ref.id, parsed };
  }

  glog('verify: no match after scanning', scanned, 'email(s)');
  if (sawUtrAmountMatchButWrongRef) {
    return { ok: false, reason: 'txn_not_in_receipt' };
  }
  return { ok: false, reason: 'no_matching_receipt' };
}

module.exports = {
  findFamAppReceiptForUtr,
  getGmail,
};
