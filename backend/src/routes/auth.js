const express = require('express');
const crypto = require('crypto');
const { google } = require('googleapis');
const {
  upsertGoogleUser,
  upsertDevUser,
  requireAuth,
  emailAllowed,
} = require('../lib/auth');
const { query } = require('../lib/db');

const router = express.Router();

function trimEnv(name) {
  const v = process.env[name];
  return v == null ? v : String(v).trim();
}

function callbackUrl(req) {
  const configured = trimEnv('GOOGLE_CALLBACK_URL');
  if (configured) return configured;
  if (req) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('x-forwarded-host') || req.get('host');
    if (host) return `${proto}://${host}/auth/google/callback`;
  }
  return 'http://localhost:4000/auth/google/callback';
}

function oauth2Client(reqOrRedirect) {
  const redirectUri =
    typeof reqOrRedirect === 'string' ? reqOrRedirect : callbackUrl(reqOrRedirect);
  return new google.auth.OAuth2(
    trimEnv('GOOGLE_CLIENT_ID'),
    trimEnv('GOOGLE_CLIENT_SECRET'),
    redirectUri
  );
}

router.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user });
});

router.get('/google', (req, res) => {
  if (!trimEnv('GOOGLE_CLIENT_ID') || !trimEnv('GOOGLE_CLIENT_SECRET')) {
    return res.status(503).json({ error: 'Google OAuth not configured' });
  }
  const redirectUri = callbackUrl(req);
  const client = oauth2Client(redirectUri);
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  req.session.oauthRedirectUri = redirectUri;
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    state,
  });
  res.redirect(url);
});

router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) {
      return res.status(400).send(
        `Google OAuth error: ${error}${errorDescription ? ` — ${errorDescription}` : ''}<br/><br/>` +
          `Callback URL this app uses: <code>${callbackUrl(req)}</code><br/>` +
          `Fix: Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client → ` +
          `Authorized redirect URIs must include that exact URL (https, no trailing slash mismatch).`
      );
    }
    if (!code || state !== req.session.oauthState) {
      return res.status(400).send('Invalid OAuth state');
    }
    const redirectUri = req.session.oauthRedirectUri || callbackUrl(req);
    const client = oauth2Client(redirectUri);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    if (!emailAllowed(data.email)) {
      return res.status(403).send('Email domain not allowed');
    }
    const user = await upsertGoogleUser({
      email: data.email,
      name: data.name,
      avatarUrl: data.picture,
      oauthId: data.id,
    });
    // Shared org mailbox: store refresh token on org email account when present
    if (tokens.refresh_token) {
      await query(
        `INSERT INTO email_accounts (org_id, email, provider, access_token, refresh_token, token_expiry, is_shared)
         VALUES ($1, $2, 'gmail', $3, $4, to_timestamp($5), true)
         ON CONFLICT (org_id, email) DO UPDATE SET
           access_token = EXCLUDED.access_token,
           refresh_token = COALESCE(EXCLUDED.refresh_token, email_accounts.refresh_token),
           token_expiry = EXCLUDED.token_expiry`,
        [
          user.org_id,
          data.email,
          tokens.access_token || null,
          tokens.refresh_token,
          tokens.expiry_date ? tokens.expiry_date / 1000 : null,
        ]
      );
    }
    req.session.userId = user.id;
    req.session.orgId = user.org_id;
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    res.redirect(`${appUrl}/`);
  } catch (err) {
    const msg = err?.response?.data?.error || err.message || 'oauth_failed';
    if (String(msg).includes('unauthorized_client') || err.code === 'unauthorized_client') {
      return res.status(400).send(
        `Google unauthorized_client<br/><br/>` +
          `Usually: redirect URI mismatch, or client ID/secret/refresh token not from the same Web OAuth client.<br/>` +
          `This app callback: <code>${callbackUrl(req)}</code><br/>` +
          `Add that exact URI in Google Cloud → Credentials → OAuth client → Authorized redirect URIs.<br/>` +
          `Then clear GMAIL_REFRESH_TOKEN and sign in with Google again to mint a new token.`
      );
    }
    next(err);
  }
});

router.get('/dev-login/status', (_req, res) => {
  const enabled = Boolean(process.env.DEV_AUTH_EMAIL && process.env.DEV_AUTH_PASSWORD);
  res.json({
    enabled,
    googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
});

router.post('/dev-login', async (req, res, next) => {
  try {
    const email = process.env.DEV_AUTH_EMAIL;
    const pass = process.env.DEV_AUTH_PASSWORD;
    if (!email || !pass) {
      return res.status(503).json({
        error: 'Developer pass not configured (set DEV_AUTH_EMAIL + DEV_AUTH_PASSWORD)',
      });
    }
    const bodyEmail = String(req.body?.email || '').trim().toLowerCase();
    const bodyPass = String(req.body?.password || '');
    if (!bodyEmail || !bodyPass) {
      return res.status(400).json({ error: 'email and password required' });
    }
    if (bodyEmail !== email.toLowerCase() || bodyPass !== pass) {
      return res.status(401).json({ error: 'Invalid developer credentials' });
    }
    const user = await upsertDevUser();
    if (!user) return res.status(503).json({ error: 'Could not create developer user' });
    req.session.userId = user.id;
    req.session.orgId = user.org_id;
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

module.exports = router;
