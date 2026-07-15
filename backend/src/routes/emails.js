const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const {
  syncMailbox,
  syncFolder,
  sendReply,
  sendMessage,
  getSharedAccount,
  modifyLabels,
  folderCounts,
  probeGmail,
} = require('../services/gmailService');
const { readFile, saveBuffer } = require('../lib/storage');
const { organizeFilesToClient } = require('../services/organizeAgent');

const router = express.Router();
router.use(requireAuth);

router.get('/status', async (req, res, next) => {
  try {
    const account = await getSharedAccount(req.user.org_id);
    const counts = await folderCounts(req.user.org_id);
    const probe = await probeGmail(req.user.org_id);
    res.json({
      connected: probe.connected,
      needsReconnect: probe.needsReconnect,
      reason: probe.reason || null,
      email: probe.email || account?.email || process.env.GMAIL_USER || null,
      shared: true,
      reconnectUrl: '/auth/google',
      counts,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const folder = req.query.folder || 'inbox';
    const q = (req.query.q || '').trim();
    const unreadOnly = req.query.unread === '1';
    const starredOnly = req.query.starred === '1';
    const params = [req.user.org_id];
    let sql = `
      SELECT e.id, e.subject, e.snippet, e.from_address, e.to_address, e.cc, e.folder, e.labels,
             e.read, e.flagged, e.has_attachments, e.direction, e.client_id, e.thread_id,
             e.received_at, e.sent_at, e.created_at, e.gmail_message_id,
             c.name AS client_name
      FROM emails e
      LEFT JOIN clients c ON c.id = e.client_id
      WHERE e.org_id = $1`;

    if (folder === 'starred') {
      sql += ' AND e.flagged = true';
    } else if (folder === 'important') {
      sql += ` AND 'IMPORTANT' = ANY(e.labels)`;
    } else if (folder === 'all') {
      sql += ` AND e.folder NOT IN ('trash','spam')`;
    } else {
      params.push(folder);
      sql += ` AND e.folder = $${params.length}`;
    }
    if (unreadOnly) sql += ' AND e.read = false';
    if (starredOnly) sql += ' AND e.flagged = true';
    if (q) {
      params.push(`%${q}%`);
      const i = params.length;
      sql += ` AND (e.subject ILIKE $${i} OR e.snippet ILIKE $${i} OR e.from_address ILIKE $${i} OR e.to_address ILIKE $${i})`;
    }
    sql += ' ORDER BY COALESCE(e.received_at, e.sent_at, e.created_at) DESC LIMIT 200';
    const { rows } = await query(sql, params);
    res.json({ emails: rows, folder });
  } catch (err) {
    next(err);
  }
});

router.get('/threads/:threadId', async (req, res, next) => {
  try {
    const thread = await query(
      'SELECT * FROM email_threads WHERE id = $1 AND org_id = $2',
      [req.params.threadId, req.user.org_id]
    );
    if (!thread.rows[0]) return res.status(404).json({ error: 'Not found' });
    const messages = await query(
      `SELECT id, subject, from_address, to_address, snippet, read, flagged, folder,
              received_at, sent_at, has_attachments
       FROM emails WHERE thread_id = $1 ORDER BY COALESCE(received_at, sent_at, created_at) ASC`,
      [req.params.threadId]
    );
    res.json({ thread: thread.rows[0], messages: messages.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/sync', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const folder = req.body?.folder;
    const max = Number(req.body?.max) || 50;
    const result = folder
      ? await syncFolder(req.user.org_id, folder, { max, search: req.body?.search || '' })
      : await syncMailbox(req.user.org_id, {
          max,
          folders: req.body?.folders || ['inbox', 'spam', 'sent', 'trash', 'drafts', 'starred'],
        });
    const counts = await folderCounts(req.user.org_id);
    res.json({ ...result, counts });
  } catch (err) {
    next(err);
  }
});

router.post('/compose', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { to, cc, bcc, subject, html, text } = req.body || {};
    if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });
    const sent = await sendMessage(req.user.org_id, { to, cc, bcc, subject, html, text });
    res.json({ sent });
  } catch (err) {
    next(err);
  }
});

router.post('/organize', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { clientId, files } = req.body || {};
    if (!clientId || !Array.isArray(files)) {
      return res.status(400).json({ error: 'clientId and files required' });
    }
    const result = await organizeFilesToClient({
      orgId: req.user.org_id,
      userId: req.user.id,
      clientId,
      files,
      saveBuffer,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT e.*, c.name AS client_name
       FROM emails e LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.id = $1 AND e.org_id = $2`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const email = rows[0];
    let body = null;
    let bodyHtml = null;
    if (email.body_file_path) {
      try {
        body = readFile(email.body_file_path).toString('utf8');
      } catch {
        body = null;
      }
    }
    if (email.body_html_path) {
      try {
        bodyHtml = readFile(email.body_html_path).toString('utf8');
      } catch {
        bodyHtml = null;
      }
    }
    const notes = await query(
      `SELECT n.*, u.name AS author_name FROM email_internal_notes n
       LEFT JOIN users u ON u.id = n.user_id WHERE n.email_id = $1 ORDER BY n.created_at`,
      [req.params.id]
    );
    // Mark read in Gmail + DB when opened
    if (!email.read && email.gmail_message_id) {
      try {
        await modifyLabels(req.user.org_id, email.gmail_message_id, {
          remove: ['UNREAD'],
        });
      } catch {
        await query('UPDATE emails SET read = true WHERE id = $1', [email.id]);
      }
    }
    res.json({ email: { ...email, read: true }, body, bodyHtml, notes: notes.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reply', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      'SELECT * FROM emails WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    const email = rows[0];
    if (!email) return res.status(404).json({ error: 'Not found' });
    const to = req.body.to || email.from_address;
    const subject = req.body.subject || (email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`);
    const thread = email.thread_id
      ? await query('SELECT gmail_thread_id FROM email_threads WHERE id = $1', [email.thread_id])
      : { rows: [] };
    const sent = await sendReply(req.user.org_id, {
      to,
      cc: req.body.cc,
      subject,
      html: req.body.html,
      text: req.body.text,
      body: req.body.body,
      threadId: thread.rows[0]?.gmail_thread_id || email.gmail_thread_id,
    });
    res.json({ sent });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/forward', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      'SELECT * FROM emails WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    const email = rows[0];
    if (!email) return res.status(404).json({ error: 'Not found' });
    let bodyHtml = '';
    if (email.body_html_path) {
      try {
        bodyHtml = readFile(email.body_html_path).toString('utf8');
      } catch {
        bodyHtml = '';
      }
    }
    if (!bodyHtml && email.body_file_path) {
      try {
        const text = readFile(email.body_file_path).toString('utf8');
        bodyHtml = `<pre>${text.replace(/</g, '&lt;')}</pre>`;
      } catch {
        bodyHtml = email.snippet || '';
      }
    }
    const quote = `
      <div style="color:#64748b;font-size:12px;margin:16px 0">---------- Forwarded message ----------<br/>
      From: ${email.from_address || ''}<br/>
      Subject: ${email.subject || ''}<br/>
      Date: ${email.received_at || email.sent_at || ''}</div>
      ${bodyHtml}
    `;
    const html = `${req.body.html || ''}${quote}`;
    const sent = await sendMessage(req.user.org_id, {
      to: req.body.to,
      cc: req.body.cc,
      subject: req.body.subject || (email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || ''}`),
      html,
      text: req.body.text,
    });
    res.json({ sent });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/notes', async (req, res, next) => {
  try {
    const note = req.body?.note;
    if (!note) return res.status(400).json({ error: 'note required' });
    const { rows } = await query(
      `INSERT INTO email_internal_notes (email_id, user_id, note)
       SELECT e.id, $2, $3 FROM emails e WHERE e.id = $1 AND e.org_id = $4
       RETURNING *`,
      [req.params.id, req.user.id, note, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.status(201).json({ note: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const clientId = req.body?.clientId;
    if (clientId === undefined) return res.status(400).json({ error: 'clientId required (null to unlink)' });
    if (clientId) {
      const ok = await query('SELECT id FROM clients WHERE id = $1 AND org_id = $2', [
        clientId,
        req.user.org_id,
      ]);
      if (!ok.rows[0]) return res.status(404).json({ error: 'Client not found' });
    }
    const { rows } = await query(
      `UPDATE emails SET client_id = $3
       WHERE id = $1 AND org_id = $2 RETURNING *`,
      [req.params.id, req.user.org_id, clientId || null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    if (rows[0].thread_id) {
      await query(
        `UPDATE email_threads SET client_id = $2, updated_at = now() WHERE id = $1 AND org_id = $3`,
        [rows[0].thread_id, clientId || null, req.user.org_id]
      );
    }
    res.json({ email: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/actions', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      'SELECT * FROM emails WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    const email = rows[0];
    if (!email?.gmail_message_id) return res.status(404).json({ error: 'Not found' });
    const action = req.body?.action;
    let add = [];
    let remove = [];
    if (action === 'star') add = ['STARRED'];
    else if (action === 'unstar') remove = ['STARRED'];
    else if (action === 'read') remove = ['UNREAD'];
    else if (action === 'unread') add = ['UNREAD'];
    else if (action === 'spam') {
      add = ['SPAM'];
      remove = ['INBOX'];
    }
    else if (action === 'unspam') {
      add = ['INBOX'];
      remove = ['SPAM'];
    }
    else if (action === 'trash') {
      add = ['TRASH'];
      remove = ['INBOX'];
    }
    else if (action === 'restore') {
      add = ['INBOX'];
      remove = ['TRASH'];
    }
    else if (action === 'archive') remove = ['INBOX'];
    else return res.status(400).json({ error: 'Unknown action' });

    const updated = await modifyLabels(req.user.org_id, email.gmail_message_id, { add, remove });
    res.json({ email: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
