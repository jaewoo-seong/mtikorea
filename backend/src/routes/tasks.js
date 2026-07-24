const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

const MENTION_RE = /@([a-zA-Z0-9_-]+)/g;

// A decision is the outcome of a request; `status` is where the card sits. Kept
// in lockstep here so the two can never disagree, and so the existing
// shared_tasks status CHECK (open/in_progress/done/cancelled) still holds.
const DECISION_STATUS = {
  approved: 'done',
  rejected: 'cancelled',
  changes_requested: 'open',
};

const EVENT_FOR_DECISION = {
  approved: 'approved',
  rejected: 'rejected',
  changes_requested: 'changes_requested',
};

function forbidViewer(req, res) {
  if (req.user.role === 'viewer') {
    res.status(403).json({ error: 'Forbidden' });
    return true;
  }
  return false;
}

/** Resolve @username tokens in a comment body to user ids within the same org. */
async function resolveMentions(body, orgId) {
  const handles = [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase()))];
  if (!handles.length) return [];
  // Accounts without a set username (master admin, Google sign-ins) are still
  // mentionable via the local part of their email as a fallback handle.
  const { rows } = await query(
    `SELECT id FROM users
     WHERE org_id = $1
       AND lower(COALESCE(username, split_part(email, '@', 1))) = ANY($2::text[])`,
    [orgId, handles]
  );
  return rows.map((r) => r.id);
}

async function logEvent(taskId, orgId, actorId, type, payload = {}) {
  await query(
    `INSERT INTO task_events (task_id, org_id, actor_id, type, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [taskId, orgId, actorId, type, JSON.stringify(payload)]
  );
}

/**
 * Add participants without demoting anyone: being pulled in as a follower must
 * never downgrade an existing approver, which is what a plain upsert would do.
 *
 * Promotion in the other direction is allowed, including owner -> approver, so
 * that naming yourself an approver on your own request actually takes. Who
 * raised a request is recorded on shared_tasks.created_by, not by this row, so
 * nothing is lost when the owner's seat is upgraded.
 */
const ROLE_RANK = { follower: 0, owner: 1, approver: 2 };

async function addParticipants(taskId, userIds, role, addedBy) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  await query(
    `INSERT INTO task_participants (task_id, user_id, role, added_by)
     SELECT $1, uid, $3, $4 FROM unnest($2::uuid[]) AS uid
     ON CONFLICT (task_id, user_id) DO UPDATE
       SET role = CASE
         WHEN $5::int > CASE task_participants.role
                          WHEN 'approver' THEN 2 WHEN 'owner' THEN 1 ELSE 0 END
         THEN EXCLUDED.role
         ELSE task_participants.role
       END`,
    [taskId, ids, role, addedBy, ROLE_RANK[role] ?? 0]
  );
}

/** Ensure the task exists in the caller's org; returns the row or null. */
async function loadTask(id, orgId) {
  const { rows } = await query('SELECT * FROM shared_tasks WHERE id = $1 AND org_id = $2', [
    id,
    orgId,
  ]);
  return rows[0] || null;
}

// Participants and attachments are aggregated as JSON so a task list is one
// round trip rather than N+1 lookups per card.
const TASK_SELECT = `
  SELECT t.*,
         c.name AS client_name,
         p.title AS project_title,
         COALESCE(owner.name, owner.email) AS owner_name,
         COALESCE(pa.participants, '[]'::json) AS participants,
         COALESCE(at.attachments, '[]'::json) AS attachments,
         COALESCE(uc.unread_count, 0) AS unread_count,
         COALESCE(cc.comment_count, 0) AS comment_count
    FROM shared_tasks t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN users owner ON owner.id = t.created_by
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'user_id', u.id,
               'name', COALESCE(u.name, u.email),
               'email', u.email,
               'handle', lower(COALESCE(u.username, split_part(u.email, '@', 1))),
               'role', tp.role
             ) ORDER BY tp.role, u.name) AS participants
        FROM task_participants tp
        JOIN users u ON u.id = tp.user_id
       WHERE tp.task_id = t.id
    ) pa ON TRUE
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'id', ta.id,
               'document_id', d.id,
               'title', d.title,
               'filename', d.filename,
               'mime_type', d.mime_type,
               'size_bytes', d.size_bytes,
               'added_at', ta.added_at
             ) ORDER BY ta.added_at) AS attachments
        FROM task_attachments ta
        JOIN shared_documents d ON d.id = ta.document_id
       WHERE ta.task_id = t.id
    ) at ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS unread_count
        FROM task_comments tc
        LEFT JOIN task_comment_reads r ON r.task_id = t.id AND r.user_id = $2
       WHERE tc.task_id = t.id
         AND tc.author_id IS DISTINCT FROM $2
         AND tc.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
    ) uc ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS comment_count FROM task_comments tc WHERE tc.task_id = t.id
    ) cc ON TRUE
   WHERE t.org_id = $1`;

// ---------------------------------------------------------------------------
// Static routes first — these must not be shadowed by /:id.
// ---------------------------------------------------------------------------

router.get('/unread', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t.id AS task_id, t.title,
              COUNT(c.id) FILTER (
                WHERE c.author_id IS DISTINCT FROM $2
                  AND c.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
              )::int AS unread_count
         FROM shared_tasks t
         JOIN task_participants tp ON tp.task_id = t.id AND tp.user_id = $2
         LEFT JOIN task_comment_reads r ON r.task_id = t.id AND r.user_id = $2
         LEFT JOIN task_comments c ON c.task_id = t.id
        WHERE t.org_id = $1
        GROUP BY t.id, t.title
       HAVING COUNT(c.id) FILTER (
                WHERE c.author_id IS DISTINCT FROM $2
                  AND c.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
              ) > 0`,
      [req.user.org_id, req.user.id]
    );
    const total = rows.reduce((sum, r) => sum + r.unread_count, 0);
    res.json({ total, tasks: rows });
  } catch (err) {
    next(err);
  }
});

/** Per-inbox counts for the sidebar rail. */
router.get('/counts', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (
           WHERE t.decision = 'pending' AND t.status NOT IN ('done', 'cancelled')
             AND EXISTS (SELECT 1 FROM task_participants tp
                          WHERE tp.task_id = t.id AND tp.user_id = $2 AND tp.role = 'approver')
         )::int AS awaiting_me,
         COUNT(*) FILTER (
           WHERE EXISTS (SELECT 1 FROM task_participants tp
                          WHERE tp.task_id = t.id AND tp.user_id = $2 AND tp.role = 'approver')
         )::int AS assigned_to_me,
         COUNT(*) FILTER (WHERE t.created_by = $2)::int AS mine,
         COUNT(*) FILTER (
           WHERE EXISTS (SELECT 1 FROM task_participants tp
                          WHERE tp.task_id = t.id AND tp.user_id = $2)
         )::int AS following,
         COUNT(*)::int AS all_count
       FROM shared_tasks t
      WHERE t.org_id = $1`,
      [req.user.org_id, req.user.id]
    );
    res.json({ counts: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { clientId, projectId, status, kind, inbox, q } = req.query;
    const params = [req.user.org_id, req.user.id];
    let sql = TASK_SELECT;

    const push = (val) => {
      params.push(val);
      return `$${params.length}`;
    };

    if (clientId) sql += ` AND t.client_id = ${push(clientId)}`;
    if (projectId) sql += ` AND t.project_id = ${push(projectId)}`;
    if (status) sql += ` AND t.status = ${push(status)}`;
    if (kind) sql += ` AND t.kind = ${push(kind)}`;
    if (q) sql += ` AND (t.title ILIKE ${push(`%${q}%`)} OR t.description ILIKE $${params.length})`;

    switch (inbox) {
      case 'awaiting_me':
        sql += ` AND t.decision = 'pending' AND t.status NOT IN ('done', 'cancelled')
                 AND EXISTS (SELECT 1 FROM task_participants tp
                              WHERE tp.task_id = t.id AND tp.user_id = $2 AND tp.role = 'approver')`;
        break;
      case 'assigned_to_me':
        sql += ` AND EXISTS (SELECT 1 FROM task_participants tp
                              WHERE tp.task_id = t.id AND tp.user_id = $2 AND tp.role = 'approver')`;
        break;
      case 'mine':
        sql += ' AND t.created_by = $2';
        break;
      case 'following':
        sql += ` AND EXISTS (SELECT 1 FROM task_participants tp
                              WHERE tp.task_id = t.id AND tp.user_id = $2)`;
        break;
      default:
        break;
    }

    // Urgent-first, then most recently touched.
    sql += ` ORDER BY
               CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1
                               WHEN 'normal' THEN 2 ELSE 3 END,
               t.updated_at DESC`;
    const { rows } = await query(sql, params);
    res.json({ tasks: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (forbidViewer(req, res)) return;
    let {
      title,
      description,
      kind,
      priority,
      clientId,
      projectId,
      dueAt,
      approverIds,
      followerIds,
      documentIds,
    } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });

    // Linking a project or a document implies its client, so the request still
    // files itself correctly when the requester only picks one of them.
    if (projectId && !clientId) {
      const proj = await query('SELECT client_id FROM projects WHERE id = $1 AND org_id = $2', [
        projectId,
        req.user.org_id,
      ]);
      if (proj.rows[0]?.client_id) clientId = proj.rows[0].client_id;
    }
    const docIds = [...new Set((documentIds || []).filter(Boolean))];
    if (docIds.length && (!clientId || !projectId)) {
      const doc = await query(
        'SELECT client_id, project_id FROM shared_documents WHERE id = $1 AND org_id = $2',
        [docIds[0], req.user.org_id]
      );
      if (doc.rows[0]) {
        clientId = clientId || doc.rows[0].client_id;
        projectId = projectId || doc.rows[0].project_id;
      }
    }

    const approvers = [...new Set((approverIds || []).filter(Boolean))];
    const { rows } = await query(
      `INSERT INTO shared_tasks (
         org_id, client_id, project_id, title, description, created_by, due_at,
         kind, priority, decision, status,
         assignee_id, feedback_requested
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','open',$10,$11)
       RETURNING *`,
      [
        req.user.org_id,
        clientId || null,
        projectId || null,
        title.trim(),
        description || null,
        req.user.id,
        dueAt || null,
        kind || 'request',
        priority || 'normal',
        // Legacy columns are still written so anything reading the old shape
        // (and the 016 backfill, if re-run) stays consistent.
        approvers[0] || null,
        (kind || 'request') === 'approval',
      ]
    );
    const task = rows[0];

    await addParticipants(task.id, [req.user.id], 'owner', req.user.id);
    await addParticipants(task.id, approvers, 'approver', req.user.id);
    await addParticipants(task.id, followerIds, 'follower', req.user.id);

    if (docIds.length) {
      await query(
        `INSERT INTO task_attachments (task_id, document_id, added_by)
         SELECT $1, did, $3 FROM unnest($2::uuid[]) AS did
         WHERE EXISTS (SELECT 1 FROM shared_documents d WHERE d.id = did AND d.org_id = $4)
         ON CONFLICT (task_id, document_id) DO NOTHING`,
        [task.id, docIds, req.user.id, req.user.org_id]
      );
      if (!task.document_id) {
        await query('UPDATE shared_tasks SET document_id = $2 WHERE id = $1', [task.id, docIds[0]]);
      }
    }

    await logEvent(task.id, req.user.org_id, req.user.id, 'created', { kind: task.kind });
    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`${TASK_SELECT} AND t.id = $3`, [
      req.user.org_id,
      req.user.id,
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (forbidViewer(req, res)) return;
    const map = {
      title: 'title',
      description: 'description',
      status: 'status',
      dueAt: 'due_at',
      clientId: 'client_id',
      projectId: 'project_id',
      kind: 'kind',
      priority: 'priority',
    };
    const before = await loadTask(req.params.id, req.user.org_id);
    if (!before) return res.status(404).json({ error: 'Not found' });

    const updates = [];
    const params = [];
    for (const [key, col] of Object.entries(map)) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key] === '' ? null : req.body[key]);
        updates.push(`${col} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });

    // Dragging a request back out of a resolved column clears the decision, so a
    // reopened request doesn't keep claiming it was approved.
    if (req.body.status !== undefined && !['done', 'cancelled'].includes(req.body.status)) {
      updates.push("decision = 'pending'", 'decided_by = NULL', 'decided_at = NULL');
    }

    params.push(req.params.id, req.user.org_id);
    const { rows } = await query(
      `UPDATE shared_tasks SET ${updates.join(', ')}, updated_at = now()
        WHERE id = $${params.length - 1} AND org_id = $${params.length}
        RETURNING *`,
      params
    );

    if (req.body.status !== undefined && req.body.status !== before.status) {
      const reopened = ['done', 'cancelled'].includes(before.status);
      await logEvent(
        req.params.id,
        req.user.org_id,
        req.user.id,
        reopened ? 'reopened' : 'status_changed',
        { from: before.status, to: req.body.status }
      );
    }
    res.json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (forbidViewer(req, res)) return;
    await query('DELETE FROM shared_tasks WHERE id = $1 AND org_id = $2', [
      req.params.id,
      req.user.org_id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

router.post('/:id/decision', async (req, res, next) => {
  try {
    if (forbidViewer(req, res)) return;
    const { decision, note } = req.body || {};
    if (!DECISION_STATUS[decision]) {
      return res.status(400).json({ error: 'decision must be approved, rejected, or changes_requested' });
    }
    const task = await loadTask(req.params.id, req.user.org_id);
    if (!task) return res.status(404).json({ error: 'Not found' });

    // Only a named approver decides. Admins can always unblock a stuck request.
    const { rows: seat } = await query(
      `SELECT 1 FROM task_participants
        WHERE task_id = $1 AND user_id = $2 AND role IN ('approver', 'owner')`,
      [req.params.id, req.user.id]
    );
    if (!seat.length && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only an approver on this request can decide it' });
    }

    const { rows } = await query(
      `UPDATE shared_tasks
          SET decision = $3, status = $4, decided_by = $5, decided_at = now(),
              feedback_notes = COALESCE($6, feedback_notes), updated_at = now()
        WHERE id = $1 AND org_id = $2
        RETURNING *`,
      [
        req.params.id,
        req.user.org_id,
        decision,
        DECISION_STATUS[decision],
        req.user.id,
        note ? note.trim() : null,
      ]
    );
    await logEvent(req.params.id, req.user.org_id, req.user.id, EVENT_FOR_DECISION[decision], {
      note: note ? note.trim() : null,
    });
    res.json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

router.post('/:id/participants', async (req, res, next) => {
  try {
    if (forbidViewer(req, res)) return;
    const { userIds, role } = req.body || {};
    if (!['approver', 'follower'].includes(role)) {
      return res.status(400).json({ error: 'role must be approver or follower' });
    }
    const task = await loadTask(req.params.id, req.user.org_id);
    if (!task) return res.status(404).json({ error: 'Not found' });

    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ error: 'userIds required' });
    // Never let a request pull in someone from another org.
    const { rows: valid } = await query(
      'SELECT id FROM users WHERE org_id = $1 AND id = ANY($2::uuid[])',
      [req.user.org_id, ids]
    );
    await addParticipants(req.params.id, valid.map((r) => r.id), role, req.user.id);
    for (const r of valid) {
      await logEvent(req.params.id, req.user.org_id, req.user.id, 'participant_added', {
        user_id: r.id,
        role,
      });
    }
    const { rows } = await query(`${TASK_SELECT} AND t.id = $3`, [
      req.user.org_id,
      req.user.id,
      req.params.id,
    ]);
    res.json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/participants/:userId', async (req, res, next) => {
  try {
    if (forbidViewer(req, res)) return;
    const task = await loadTask(req.params.id, req.user.org_id);
    if (!task) return res.status(404).json({ error: 'Not found' });
    // The owner seat is what ties a request to who raised it; removing it would
    // orphan the request from the "My requests" inbox.
    const { rowCount } = await query(
      "DELETE FROM task_participants WHERE task_id = $1 AND user_id = $2 AND role <> 'owner'",
      [req.params.id, req.params.userId]
    );
    if (!rowCount) return res.status(400).json({ error: 'Cannot remove the request owner' });
    await logEvent(req.params.id, req.user.org_id, req.user.id, 'participant_removed', {
      user_id: req.params.userId,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

router.post('/:id/attachments', async (req, res, next) => {
  try {
    if (forbidViewer(req, res)) return;
    const { documentIds } = req.body || {};
    const ids = [...new Set((documentIds || []).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ error: 'documentIds required' });
    const task = await loadTask(req.params.id, req.user.org_id);
    if (!task) return res.status(404).json({ error: 'Not found' });

    const { rows: added } = await query(
      `INSERT INTO task_attachments (task_id, document_id, added_by)
       SELECT $1, did, $3 FROM unnest($2::uuid[]) AS did
       WHERE EXISTS (SELECT 1 FROM shared_documents d WHERE d.id = did AND d.org_id = $4)
       ON CONFLICT (task_id, document_id) DO NOTHING
       RETURNING document_id`,
      [req.params.id, ids, req.user.id, req.user.org_id]
    );
    for (const r of added) {
      await logEvent(req.params.id, req.user.org_id, req.user.id, 'attachment_added', {
        document_id: r.document_id,
      });
    }
    await query('UPDATE shared_tasks SET updated_at = now() WHERE id = $1', [req.params.id]);
    const { rows } = await query(`${TASK_SELECT} AND t.id = $3`, [
      req.user.org_id,
      req.user.id,
      req.params.id,
    ]);
    res.json({ task: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/attachments/:documentId', async (req, res, next) => {
  try {
    if (forbidViewer(req, res)) return;
    const task = await loadTask(req.params.id, req.user.org_id);
    if (!task) return res.status(404).json({ error: 'Not found' });
    await query('DELETE FROM task_attachments WHERE task_id = $1 AND document_id = $2', [
      req.params.id,
      req.params.documentId,
    ]);
    await logEvent(req.params.id, req.user.org_id, req.user.id, 'attachment_removed', {
      document_id: req.params.documentId,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Thread — comments and events interleaved
// ---------------------------------------------------------------------------

router.get('/:id/thread', async (req, res, next) => {
  try {
    const [comments, events] = await Promise.all([
      query(
        `SELECT tc.id, tc.body, tc.mentions, tc.created_at, tc.author_id,
                COALESCE(u.name, u.email) AS author_name
           FROM task_comments tc
           LEFT JOIN users u ON u.id = tc.author_id
          WHERE tc.task_id = $1 AND tc.org_id = $2
          ORDER BY tc.created_at ASC`,
        [req.params.id, req.user.org_id]
      ),
      query(
        `SELECT te.id, te.type, te.payload, te.created_at, te.actor_id,
                COALESCE(u.name, u.email) AS actor_name
           FROM task_events te
           LEFT JOIN users u ON u.id = te.actor_id
          WHERE te.task_id = $1 AND te.org_id = $2
          ORDER BY te.created_at ASC`,
        [req.params.id, req.user.org_id]
      ),
    ]);

    const items = [
      ...comments.rows.map((c) => ({ ...c, item: 'comment' })),
      ...events.rows.map((e) => ({ ...e, item: 'event' })),
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Opening a thread marks it read for unread-badge purposes.
    await query(
      `INSERT INTO task_comment_reads (task_id, user_id, last_read_at)
       VALUES ($1, $2, now())
       ON CONFLICT (task_id, user_id) DO UPDATE SET last_read_at = now()`,
      [req.params.id, req.user.id]
    );
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    if (forbidViewer(req, res)) return;
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });
    const task = await loadTask(req.params.id, req.user.org_id);
    if (!task) return res.status(404).json({ error: 'Not found' });

    const trimmed = body.trim();
    const mentions = await resolveMentions(trimmed, req.user.org_id);
    const { rows } = await query(
      `INSERT INTO task_comments (task_id, org_id, author_id, body, mentions)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, req.user.org_id, req.user.id, trimmed, mentions]
    );

    // Joining the conversation is what makes you a follower — both for whoever
    // spoke and for anyone they pulled in by @mention.
    await addParticipants(req.params.id, [req.user.id, ...mentions], 'follower', req.user.id);

    // Closing the loop: once an approver has asked for changes the request sits
    // in the requester's court, so it drops out of "Needs my approval". Their
    // reply is the answer, and puts it back in the approvers' queue.
    const answersChangeRequest =
      task.decision === 'changes_requested' && task.created_by === req.user.id;
    if (answersChangeRequest) {
      await query(
        `UPDATE shared_tasks
            SET decision = 'pending', decided_by = NULL, decided_at = NULL, updated_at = now()
          WHERE id = $1`,
        [req.params.id]
      );
    } else {
      await query('UPDATE shared_tasks SET updated_at = now() WHERE id = $1', [req.params.id]);
    }
    await query(
      `INSERT INTO task_comment_reads (task_id, user_id, last_read_at)
       VALUES ($1, $2, now())
       ON CONFLICT (task_id, user_id) DO UPDATE SET last_read_at = now()`,
      [req.params.id, req.user.id]
    );

    const author = await query(
      'SELECT COALESCE(name, email) AS author_name FROM users WHERE id = $1',
      [req.user.id]
    );
    res.status(201).json({
      comment: { ...rows[0], author_name: author.rows[0]?.author_name || null, item: 'comment' },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
