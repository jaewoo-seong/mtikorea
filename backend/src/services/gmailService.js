const { google } = require('googleapis');
const { query } = require('../lib/db');
const { saveBuffer } = require('../lib/storage');

function clientFromTokens(refreshToken, accessToken) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken || undefined,
  });
  return oauth2;
}

async function getSharedAccount(orgId) {
  if (process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_USER) {
    return {
      email: process.env.GMAIL_USER,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      access_token: null,
      org_id: orgId,
    };
  }
  const { rows } = await query(
    `SELECT * FROM email_accounts WHERE org_id = $1 AND is_shared = true ORDER BY created_at DESC LIMIT 1`,
    [orgId]
  );
  return rows[0] || null;
}

async function gmailClient(orgId) {
  const account = await getSharedAccount(orgId);
  if (!account?.refresh_token) return null;
  const auth = clientFromTokens(account.refresh_token, account.access_token);
  return { gmail: google.gmail({ version: 'v1', auth }), account };
}

async function findClientByAddress(orgId, address) {
  if (!address) return null;
  const email = address.match(/<([^>]+)>/)?.[1] || address;
  const domain = email.split('@')[1];
  const byEmail = await query(
    `SELECT id FROM clients WHERE org_id = $1 AND lower(email) = lower($2) LIMIT 1`,
    [orgId, email]
  );
  if (byEmail.rows[0]) return byEmail.rows[0].id;
  if (domain) {
    const byDomain = await query(
      `SELECT id FROM clients WHERE org_id = $1 AND (
         website ILIKE $2 OR email ILIKE $3
       ) LIMIT 1`,
      [orgId, `%${domain}%`, `%@${domain}`]
    );
    if (byDomain.rows[0]) return byDomain.rows[0].id;
  }
  return null;
}

function decodeBody(payload) {
  const parts = [];
  function walk(p) {
    if (!p) return;
    if (p.body?.data) {
      parts.push(Buffer.from(p.body.data, 'base64url').toString('utf8'));
    }
    (p.parts || []).forEach(walk);
  }
  walk(payload);
  return parts.join('\n\n');
}

async function syncInbox(orgId, { max = 25 } = {}) {
  const pair = await gmailClient(orgId);
  if (!pair) {
    return { synced: 0, reason: 'no_gmail_account' };
  }
  const { gmail } = pair;
  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults: max,
    q: 'in:inbox',
  });
  const messages = list.data.messages || [];
  let synced = 0;
  for (const m of messages) {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: m.id,
      format: 'full',
    });
    const headers = full.data.payload?.headers || [];
    const get = (n) => headers.find((h) => h.name.toLowerCase() === n)?.value || '';
    const subject = get('subject');
    const from = get('from');
    const to = get('to');
    const date = get('date');
    const threadId = full.data.threadId;
    const body = decodeBody(full.data.payload);
    const saved = saveBuffer('emails', `${m.id}.txt`, Buffer.from(body || full.data.snippet || '', 'utf8'));
    const clientId = await findClientByAddress(orgId, from);

    let threadRow = await query(
      `INSERT INTO email_threads (org_id, client_id, gmail_thread_id, subject, participant_emails, last_message_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (org_id, gmail_thread_id) DO UPDATE SET
         subject = COALESCE(EXCLUDED.subject, email_threads.subject),
         client_id = COALESCE(email_threads.client_id, EXCLUDED.client_id),
         last_message_at = GREATEST(email_threads.last_message_at, EXCLUDED.last_message_at),
         updated_at = now()
       RETURNING id`,
      [
        orgId,
        clientId,
        threadId,
        subject,
        [from, to].filter(Boolean),
        date ? new Date(date) : new Date(),
      ]
    );

    await query(
      `INSERT INTO emails (
         org_id, thread_id, client_id, from_address, to_address, subject, snippet,
         body_file_path, gmail_message_id, direction, read, received_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'received',$10,$11)
       ON CONFLICT (gmail_message_id) DO NOTHING`,
      [
        orgId,
        threadRow.rows[0].id,
        clientId,
        from,
        to,
        subject,
        full.data.snippet || '',
        saved.storagePath,
        m.id,
        !(full.data.labelIds || []).includes('UNREAD'),
        date ? new Date(date) : new Date(),
      ]
    );
    synced += 1;
  }
  return { synced };
}

async function sendReply(orgId, { to, subject, body, threadId }) {
  const pair = await gmailClient(orgId);
  if (!pair) throw Object.assign(new Error('Gmail not connected'), { status: 503 });
  const { gmail, account } = pair;
  const raw = [
    `From: ${account.email}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');
  const encoded = Buffer.from(raw).toString('base64url');
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId: threadId || undefined,
    },
  });
  return res.data;
}

module.exports = {
  getSharedAccount,
  syncInbox,
  sendReply,
  findClientByAddress,
};
