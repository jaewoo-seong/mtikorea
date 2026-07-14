const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { syncInbox, sendReply, getSharedAccount } = require('../services/gmailService');
const { readFile, saveBuffer } = require('../lib/storage');
const { organizeFilesToClient } = require('../services/organizeAgent');

const router = express.Router();
router.use(requireAuth);

router.get('/status', async (req, res, next) => {
  try {
    const account = await getSharedAccount(req.user.org_id);
    res.json({
      connected: Boolean(account?.refresh_token || process.env.GMAIL_REFRESH_TOKEN),
      email: account?.email || process.env.GMAIL_USER || null,
      shared: true,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT e.*, c.name AS client_name
       FROM emails e
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.org_id = $1
       ORDER BY COALESCE(e.received_at, e.created_at) DESC
       LIMIT 100`,
      [req.user.org_id]
    );
    res.json({ emails: rows });
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
      'SELECT * FROM emails WHERE thread_id = $1 ORDER BY COALESCE(received_at, created_at) ASC',
      [req.params.threadId]
    );
    res.json({ thread: thread.rows[0], messages: messages.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM emails WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    let body = null;
    if (rows[0].body_file_path) {
      try {
        body = readFile(rows[0].body_file_path).toString('utf8');
      } catch {
        body = null;
      }
    }
    const notes = await query(
      `SELECT n.*, u.name AS author_name FROM email_internal_notes n
       LEFT JOIN users u ON u.id = n.user_id WHERE n.email_id = $1 ORDER BY n.created_at`,
      [req.params.id]
    );
    res.json({ email: rows[0], body, notes: notes.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/sync', async (req, res, next) => {
  try {
    if (req.user.role === 'viewer') return res.status(403).json({ error: 'Forbidden' });
    const result = await syncInbox(req.user.org_id, { max: Number(req.body?.max) || 25 });
    res.json(result);
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
    const subject = req.body.subject || `Re: ${email.subject || ''}`;
    const body = req.body.body || '';
    const thread = email.thread_id
      ? await query('SELECT gmail_thread_id FROM email_threads WHERE id = $1', [email.thread_id])
      : { rows: [] };
    const sent = await sendReply(req.user.org_id, {
      to,
      subject,
      body,
      threadId: thread.rows[0]?.gmail_thread_id,
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

module.exports = router;
