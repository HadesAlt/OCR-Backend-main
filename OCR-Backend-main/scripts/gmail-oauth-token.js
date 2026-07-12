'use strict';

/**
 * Generate OAuth token JSON files for Gmail API (same filenames as gmailFamApp.js).
 *
 * Prereqs:
 * 1. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client
 *    (Desktop app type works well).
 * 2. Download JSON → save as OCR-Backend-main/credentials.json (or set GMAIL_CREDENTIALS_PATH).
 * 3. Under that client, add Authorized redirect URI:
 *      http://127.0.0.1:4321/oauth2callback
 * 4. Enable Gmail API for the project.
 *
 * Run once per Google account (use the browser profile where that account is logged in):
 *   cd OCR-Backend-main
 *   node scripts/gmail-oauth-token.js samridhjss@gmail.com
 *   node scripts/gmail-oauth-token.js gurnoorsingh11162007@gmail.com
 *
 * Output: token.<sanitized_email>.json next to credentials.json (matches server lookup).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const { google } = require('googleapis');

const REDIRECT_PORT = 4321;
const REDIRECT_PATH = '/oauth2callback';
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}${REDIRECT_PATH}`;
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function accountTokenFileName(accountEmail) {
  const email = String(accountEmail || '').trim();
  if (!email) return 'token.json';
  const safe = email.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
  return `token.${safe}.json`;
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url.replace(/"/g, '\\"')}"`
      : process.platform === 'win32'
        ? `start "" "${url.replace(/"/g, '\\"')}"`
        : `xdg-open "${url.replace(/"/g, '\\"')}"`;
  exec(cmd, (err) => {
    if (err) console.error('Could not open browser automatically. Open this URL manually:\n', url);
  });
}

function loadCredentials(credPath) {
  const raw = fs.readFileSync(credPath, 'utf8');
  const keyFile = JSON.parse(raw);
  const keys = keyFile.installed || keyFile.web;
  if (!keys?.client_id || !keys?.client_secret) {
    throw new Error('credentials.json must contain installed or web client_id and client_secret');
  }
  return keys;
}

function main() {
  const accountEmail = process.argv[2];
  if (!accountEmail || !accountEmail.includes('@')) {
    console.error('Usage: node scripts/gmail-oauth-token.js <gmail-address@example.com>');
    console.error('Example: node scripts/gmail-oauth-token.js samridhjss@gmail.com');
    process.exit(1);
  }

  const backendRoot = path.join(__dirname, '..');
  const credPath = process.env.GMAIL_CREDENTIALS_PATH || path.join(backendRoot, 'credentials.json');
  if (!fs.existsSync(credPath)) {
    console.error('Missing', credPath);
    console.error('Add OAuth client JSON from Google Cloud Console as credentials.json (or set GMAIL_CREDENTIALS_PATH).');
    process.exit(1);
  }

  const keys = loadCredentials(credPath);
  const oAuth2Client = new google.auth.OAuth2(keys.client_id, keys.client_secret, REDIRECT_URI);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    login_hint: accountEmail,
  });

  const outName = accountTokenFileName(accountEmail);
  const outPath = path.join(path.dirname(credPath), outName);

  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith(REDIRECT_PATH)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const u = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
    const err = u.searchParams.get('error');
    const code = u.searchParams.get('code');
    if (err) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<p>Authorization error: ${err}</p><p>You can close this tab.</p>`);
      server.close();
      process.exit(1);
      return;
    }
    if (!code) {
      res.writeHead(400);
      res.end('Missing code');
      server.close();
      process.exit(1);
      return;
    }

    try {
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      if (!tokens.refresh_token) {
        console.warn(
          'Warning: no refresh_token in response. Revoke app access in Google Account → Security → Third-party access, then run this script again with prompt=consent.',
        );
      }
      fs.writeFileSync(outPath, JSON.stringify(tokens, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<p>Saved <strong>${outName}</strong></p><p>You can close this tab and return to the terminal.</p>`,
      );
      console.log('');
      console.log('Success. Wrote:', outPath);
      console.log('Deploy this file to your server next to credentials.json (e.g. Docker /app/).');
      server.close();
      process.exit(0);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<p>Token exchange failed: ${e.message}</p>`);
      console.error(e);
      server.close();
      process.exit(1);
    }
  });

  server.listen(REDIRECT_PORT, '127.0.0.1', () => {
    console.log('');
    console.log('--- Gmail OAuth token setup ---');
    console.log('Account (hint):', accountEmail);
    console.log('Sign in with THIS Google account in the browser when Google asks.');
    console.log('Redirect URI (must match Google Cloud Console):', REDIRECT_URI);
    console.log('');
    console.log('Opening browser… If it does not open, paste this URL:');
    console.log(authUrl);
    console.log('');
    openBrowser(authUrl);
  });
}

main();
