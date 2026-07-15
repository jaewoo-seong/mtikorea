const { google } = require('googleapis');
const { query } = require('../lib/db');
const { saveBuffer } = require('../lib/storage');

const FOLDER_QUERIES = {
  inbox: 'in:inbox',
  spam: 'in:spam',
  sent: 'in:sent',
  trash: 'in:trash',
  drafts: 'in:drafts',
  starred: 'is:starred',
  important: 'is:important',
  all: 'in:anywhere -in:trash -in:spam',
};

function trimEnv(name) {
  const v = process.env[name];
  return v == null ? v : String(v).trim();
}

function clientFromTokens(refreshToken, accessToken) {
  const clientId = trimEnv('GOOGLE_CLIENT_ID');
  const clientSecret = trimEnv('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('GOOGLE_CLIENT_ID/SECRET missing'), { status: 503 });
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({
    refresh_token: String(refreshToken || '').trim(),
    access_token: accessToken ? String(accessToken).trim() : undefined,
  });
  return oauth2;
}

function isInvalidGrant(err) {
  const code = err?.response?.data?.error || err?.code || '';
  const msg = err?.response?.data?.error_description || err?.message || '';
  return String(code).includes('invalid_grant') || String(msg).includes('invalid_grant');
}

function wrapGmailAuthError(err) {
  if (!isInvalidGrant(err)) return err;
  return Object.assign(
    new Error(
      'invalid_grant — Gmail refresh token is expired/revoked or from a different OAuth client. ' +
        'Delete Railway GMAIL_REFRESH_TOKEN (if set), then open /auth/google and sign in again with consent.'
    ),
    { status: 401, code: 'invalid_grant', cause: err }
  );
}

async function getSharedAccount(orgId) {
  // Prefer DB token (from last Google login). Env token is often stale after client rotation.
  const { rows } = await query(
    `SELECT * FROM email_accounts WHERE org_id = $1 AND is_shared = true ORDER BY created_at DESC LIMIT 1`,
    [orgId]
  );
  if (rows[0]?.refresh_token) return rows[0];

  if (trimEnv('GMAIL_REFRESH_TOKEN') && trimEnv('GMAIL_USER')) {
    return {
      email: trimEnv('GMAIL_USER'),
      refresh_token: trimEnv('GMAIL_REFRESH_TOKEN'),
      access_token: null,
      org_id: orgId,
    };
  }
  return null;
}

async function gmailClient(orgId) {
  const account = await getSharedAccount(orgId);
  if (!account?.refresh_token) return null;
  const auth = clientFromTokens(account.refresh_token, account.access_token);
  return { gmail: google.gmail({ version: 'v1', auth }), account };
}

async function probeGmail(orgId) {
  const pair = await gmailClient(orgId);
  if (!pair) {
    return { connected: false, needsReconnect: true, reason: 'no_token' };
  }
  try {
    const profile = await pair.gmail.users.getProfile({ userId: 'me' });
    return {
      connected: true,
      needsReconnect: false,
      email: profile.data.emailAddress || pair.account.email,
    };
  } catch (err) {
    if (isInvalidGrant(err)) {
      return {
        connected: false,
        needsReconnect: true,
        reason: 'invalid_grant',
        email: pair.account.email || null,
      };
    }
    throw wrapGmailAuthError(err);
  }
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

function decodePartData(data) {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf8');
}

function extractBodies(payload) {
  let text = '';
  let html = '';
  let hasAttachments = false;

  function walk(p) {
    if (!p) return;
    const mime = (p.mimeType || '').toLowerCase();
    if (p.filename && p.body?.attachmentId) hasAttachments = true;
    if (mime === 'text/plain' && p.body?.data && !text) {
      text = decodePartData(p.body.data);
    }
    if (mime === 'text/html' && p.body?.data && !html) {
      html = decodePartData(p.body.data);
    }
    (p.parts || []).forEach(walk);
  }
  walk(payload);
  if (!text && html) {
    text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return { text, html, hasAttachments };
}

function folderFromLabels(labelIds = []) {
  const set = new Set(labelIds);
  if (set.has('SPAM')) return 'spam';
  if (set.has('TRASH')) return 'trash';
  if (set.has('DRAFT')) return 'drafts';
  if (set.has('SENT') && !set.has('INBOX')) return 'sent';
  if (set.has('INBOX')) return 'inbox';
  if (set.has('STARRED')) return 'starred';
  return 'all';
}

function splitAddresses(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function upsertMessage(orgId, full, fallbackFolder) {
  const headers = full.data.payload?.headers || [];
  const get = (n) => headers.find((h) => h.name.toLowerCase() === n)?.value || '';
  const subject = get('subject');
  const from = get('from');
  const to = get('to');
  const cc = splitAddresses(get('cc'));
  const bcc = splitAddresses(get('bcc'));
  const replyTo = get('reply-to') || null;
  const date = get('date');
  const threadId = full.data.threadId;
  const labelIds = full.data.labelIds || [];
  const folder = folderFromLabels(labelIds) || fallbackFolder || 'inbox';
  const { text, html, hasAttachments } = extractBodies(full.data.payload);
  const textSaved = saveBuffer('emails', `${full.data.id}.txt`, Buffer.from(text || full.data.snippet || '', 'utf8'));
  let htmlPath = null;
  if (html) {
    htmlPath = saveBuffer('emails', `${full.data.id}.html`, Buffer.from(html, 'utf8')).storagePath;
  }
  const clientId = await findClientByAddress(orgId, from);
  const isUnread = labelIds.includes('UNREAD');
  const isStarred = labelIds.includes('STARRED');
  const direction = labelIds.includes('SENT') && !labelIds.includes('INBOX') ? 'sent' : 'received';
  const when = date ? new Date(date) : new Date();

  const threadRow = await query(
    `INSERT INTO email_threads (org_id, client_id, gmail_thread_id, subject, participant_emails, last_message_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (org_id, gmail_thread_id) DO UPDATE SET
       subject = COALESCE(EXCLUDED.subject, email_threads.subject),
       client_id = COALESCE(email_threads.client_id, EXCLUDED.client_id),
       last_message_at = GREATEST(email_threads.last_message_at, EXCLUDED.last_message_at),
       updated_at = now()
     RETURNING id`,
    [orgId, clientId, threadId, subject, [from, ...splitAddresses(to)].filter(Boolean), when]
  );

  const { rows } = await query(
    `INSERT INTO emails (
       org_id, thread_id, client_id, from_address, to_address, cc, bcc, reply_to, subject, snippet,
       body_file_path, body_html_path, gmail_message_id, gmail_thread_id, direction, read, flagged,
       folder, labels, has_attachments, received_at, sent_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
     )
     ON CONFLICT (gmail_message_id) DO UPDATE SET
       subject = EXCLUDED.subject,
       snippet = EXCLUDED.snippet,
       body_file_path = EXCLUDED.body_file_path,
       body_html_path = COALESCE(EXCLUDED.body_html_path, emails.body_html_path),
       folder = EXCLUDED.folder,
       labels = EXCLUDED.labels,
       read = EXCLUDED.read,
       flagged = EXCLUDED.flagged,
       has_attachments = EXCLUDED.has_attachments,
       client_id = COALESCE(emails.client_id, EXCLUDED.client_id),
       cc = EXCLUDED.cc,
       reply_to = EXCLUDED.reply_to
     RETURNING *`,
    [
      orgId,
      threadRow.rows[0].id,
      clientId,
      from,
      to,
      cc,
      bcc,
      replyTo,
      subject,
      full.data.snippet || '',
      textSaved.storagePath,
      htmlPath,
      full.data.id,
      threadId,
      direction,
      !isUnread,
      isStarred,
      folder,
      labelIds,
      hasAttachments,
      direction === 'received' ? when : null,
      direction === 'sent' ? when : null,
    ]
  );
  return rows[0];
}

async function syncFolder(orgId, folder, { max = 50, search = '' } = {}) {
  try {
    const pair = await gmailClient(orgId);
    if (!pair) return { synced: 0, reason: 'no_gmail_account' };
    const { gmail } = pair;
    const base = FOLDER_QUERIES[folder] || FOLDER_QUERIES.inbox;
    const q = search ? `${base} ${search}`.trim() : base;
    const list = await gmail.users.messages.list({
      userId: 'me',
      maxResults: Math.min(max, 100),
      q,
    });
    const messages = list.data.messages || [];
    let synced = 0;
    for (const m of messages) {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'full',
      });
      await upsertMessage(orgId, full, folder);
      synced += 1;
    }
    return { synced, folder, query: q };
  } catch (err) {
    throw wrapGmailAuthError(err);
  }
}

async function syncMailbox(orgId, { folders = ['inbox', 'spam', 'sent', 'trash', 'drafts', 'starred'], max = 40 } = {}) {
  try {
    const pair = await gmailClient(orgId);
    if (!pair) return { synced: 0, reason: 'no_gmail_account', byFolder: {} };
    const byFolder = {};
    let total = 0;
    for (const folder of folders) {
      const r = await syncFolder(orgId, folder, { max });
      byFolder[folder] = r.synced;
      total += r.synced;
    }
    return { synced: total, byFolder };
  } catch (err) {
    throw wrapGmailAuthError(err);
  }
}

function encodeRawMime({ from, to, cc, bcc, subject, html, text, inReplyTo, references }) {
  const boundary = `mti_${Date.now()}`;
  const headers = [
    `From: ${from}`,
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
    cc?.length ? `Cc: ${Array.isArray(cc) ? cc.join(', ') : cc}` : null,
    bcc?.length ? `Bcc: ${Array.isArray(bcc) ? bcc.join(', ') : bcc}` : null,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  const plain = text || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const htmlBody = html || `<pre style="font-family:sans-serif">${escapeHtml(plain)}</pre>`;

  const raw = [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    plain,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    `--${boundary}--`,
  ].join('\r\n');

  return Buffer.from(raw).toString('base64url');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendMessage(orgId, { to, cc, bcc, subject, html, text, threadId }) {
  try {
    const pair = await gmailClient(orgId);
    if (!pair) throw Object.assign(new Error('Gmail not connected'), { status: 503 });
    const { gmail, account } = pair;
    const raw = encodeRawMime({
      from: account.email,
      to,
      cc,
      bcc,
      subject,
      html,
      text,
    });
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId: threadId || undefined,
      },
    });
    if (res.data?.id) {
      const full = await gmail.users.messages.get({ userId: 'me', id: res.data.id, format: 'full' });
      await upsertMessage(orgId, full, 'sent');
    }
    return res.data;
  } catch (err) {
    throw wrapGmailAuthError(err);
  }
}

async function sendReply(orgId, { to, cc, subject, html, text, body, threadId }) {
  return sendMessage(orgId, {
    to,
    cc,
    subject,
    html: html || (body ? `<div>${escapeHtml(body).replace(/\n/g, '<br/>')}</div>` : undefined),
    text: text || body,
    threadId,
  });
}

async function modifyLabels(orgId, gmailMessageId, { add = [], remove = [] }) {
  try {
    const pair = await gmailClient(orgId);
    if (!pair) throw Object.assign(new Error('Gmail not connected'), { status: 503 });
    const { gmail } = pair;
    await gmail.users.messages.modify({
      userId: 'me',
      id: gmailMessageId,
      requestBody: {
        addLabelIds: add,
        removeLabelIds: remove,
      },
    });
    const full = await gmail.users.messages.get({ userId: 'me', id: gmailMessageId, format: 'full' });
    return upsertMessage(orgId, full);
  } catch (err) {
    throw wrapGmailAuthError(err);
  }
}

async function folderCounts(orgId) {
  const { rows } = await query(
    `SELECT folder, COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE read = false)::int AS unread
     FROM emails WHERE org_id = $1
     GROUP BY folder`,
    [orgId]
  );
  const map = {};
  for (const r of rows) map[r.folder] = { count: r.count, unread: r.unread };
  return map;
}

module.exports = {
  getSharedAccount,
  syncInbox: (orgId, opts) => syncFolder(orgId, 'inbox', opts),
  syncFolder,
  syncMailbox,
  sendReply,
  sendMessage,
  modifyLabels,
  findClientByAddress,
  folderCounts,
  probeGmail,
  isInvalidGrant,
  FOLDER_QUERIES,
};
