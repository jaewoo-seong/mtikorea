const express = require('express');
const { query } = require('../lib/db');
const { requireAuth, hashPassword, verifyPassword } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

/** Change own password (local / password accounts). */
router.post('/password', async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const { rows } = await query(
      `SELECT id, password_hash, username FROM users WHERE id = $1 AND org_id = $2`,
      [req.user.id, req.user.org_id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (!user.password_hash) {
      return res.status(400).json({
        error: 'This account has no password login. Ask an admin to set a username/password, or use Google sign-in.',
      });
    }
    if (!verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    await query(
      `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
      [user.id, hashPassword(newPassword)]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Personal usage — scoped to what this user actually raised, not the whole org.
 * Anyone can see their own numbers; there's nothing here another member's
 * account doesn't already expose to them elsewhere (their own projects/docs).
 */
router.get('/my-stats', async (req, res, next) => {
  try {
    const orgId = req.user.org_id;
    const userId = req.user.id;

    const [
      projectsTotal,
      projectsByStatus,
      tokensTotals,
      tokensByProject,
      documentsTotal,
      documentsByVisibility,
      requestsByRole,
      recentActivity,
    ] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM projects WHERE org_id = $1 AND created_by = $2', [
        orgId,
        userId,
      ]),
      query(
        `SELECT status, COUNT(*)::int AS count
         FROM projects WHERE org_id = $1 AND created_by = $2
         GROUP BY status ORDER BY count DESC`,
        [orgId, userId]
      ),
      query(
        `SELECT COALESCE(SUM(tokens_used), 0)::bigint AS total_tokens_used
         FROM projects WHERE org_id = $1 AND created_by = $2`,
        [orgId, userId]
      ),
      query(
        `SELECT id, title, tokens_used, token_budget, status
         FROM projects WHERE org_id = $1 AND created_by = $2
         ORDER BY tokens_used DESC LIMIT 15`,
        [orgId, userId]
      ),
      query(
        `SELECT COUNT(*)::int AS count FROM shared_documents WHERE org_id = $1 AND uploaded_by = $2`,
        [orgId, userId]
      ),
      query(
        `SELECT visibility, COUNT(*)::int AS count
         FROM shared_documents WHERE org_id = $1 AND uploaded_by = $2
         GROUP BY visibility ORDER BY count DESC`,
        [orgId, userId]
      ),
      // A request the user raised, is an approver on, or is just following — matches
      // the Requests inbox filters, so these numbers agree with what they see there.
      query(
        `SELECT tp.role, COUNT(*)::int AS count
         FROM task_participants tp
         JOIN shared_tasks t ON t.id = tp.task_id
         WHERE t.org_id = $1 AND tp.user_id = $2
         GROUP BY tp.role ORDER BY count DESC`,
        [orgId, userId]
      ),
      query(
        `SELECT e.stage, e.action, e.summary, e.model, e.tokens_used, e.created_at,
                p.title AS project_title
         FROM project_agent_events e
         JOIN projects p ON p.id = e.project_id
         WHERE e.org_id = $1 AND p.created_by = $2
         ORDER BY e.created_at DESC LIMIT 20`,
        [orgId, userId]
      ),
    ]);

    res.json({
      projects: {
        total: projectsTotal.rows[0]?.count || 0,
        byStatus: projectsByStatus.rows,
      },
      tokens: {
        totalUsed: Number(tokensTotals.rows[0]?.total_tokens_used || 0),
        byProject: tokensByProject.rows,
      },
      documents: {
        total: documentsTotal.rows[0]?.count || 0,
        byVisibility: documentsByVisibility.rows,
      },
      requests: {
        byRole: requestsByRole.rows,
      },
      recentActivity: recentActivity.rows,
    });
  } catch (err) {
    next(err);
  }
});

/** Org-wide operational overview — admin only; members get /my-stats instead. */
router.get('/stats', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const orgId = req.user.org_id;

    const [
      projectsTotal,
      projectsByStatus,
      tokensTotals,
      tokensByProject,
      tokensByModel,
      eventsTotal,
      eventsByStage,
      documentsByVisibility,
      tasksByStatus,
      activeUsers,
      recentActivity,
    ] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM projects WHERE org_id = $1', [orgId]),
      query(
        `SELECT status, COUNT(*)::int AS count
         FROM projects WHERE org_id = $1
         GROUP BY status ORDER BY count DESC`,
        [orgId]
      ),
      query(
        `SELECT
           COALESCE(SUM(tokens_used), 0)::bigint AS total_tokens_used,
           COALESCE(SUM(tokens_used) FILTER (WHERE token_budget IS NOT NULL), 0)::bigint AS legacy_tokens_used,
           COALESCE(SUM(token_budget) FILTER (WHERE token_budget IS NOT NULL), 0)::bigint AS legacy_token_budget,
           COUNT(*) FILTER (WHERE token_budget IS NOT NULL)::int AS legacy_capped_count
         FROM projects WHERE org_id = $1`,
        [orgId]
      ),
      query(
        `SELECT id, title, tokens_used, token_budget, time_budget_minutes
         FROM projects WHERE org_id = $1
         ORDER BY tokens_used DESC
         LIMIT 15`,
        [orgId]
      ),
      query(
        `SELECT model, COALESCE(SUM(tokens_used), 0)::bigint AS tokens, COUNT(*)::int AS count
         FROM project_agent_events
         WHERE org_id = $1 AND model IS NOT NULL
         GROUP BY model
         ORDER BY tokens DESC`,
        [orgId]
      ),
      query('SELECT COUNT(*)::int AS count FROM project_agent_events WHERE org_id = $1', [orgId]),
      query(
        `SELECT stage, COUNT(*)::int AS count
         FROM project_agent_events WHERE org_id = $1
         GROUP BY stage ORDER BY count DESC`,
        [orgId]
      ),
      query(
        `SELECT visibility, COUNT(*)::int AS count
         FROM shared_documents WHERE org_id = $1
         GROUP BY visibility ORDER BY count DESC`,
        [orgId]
      ),
      query(
        `SELECT status, COUNT(*)::int AS count
         FROM shared_tasks WHERE org_id = $1
         GROUP BY status ORDER BY count DESC`,
        [orgId]
      ),
      query(
        `SELECT COUNT(*)::int AS count FROM users WHERE org_id = $1 AND active = true`,
        [orgId]
      ),
      query(
        `SELECT e.stage, e.action, e.summary, e.model, e.tokens_used, e.created_at,
                p.title AS project_title
         FROM project_agent_events e
         LEFT JOIN projects p ON p.id = e.project_id
         WHERE e.org_id = $1
         ORDER BY e.created_at DESC
         LIMIT 20`,
        [orgId]
      ),
    ]);

    res.json({
      projects: {
        total: projectsTotal.rows[0]?.count || 0,
        byStatus: projectsByStatus.rows,
      },
      tokens: {
        totalUsed: Number(tokensTotals.rows[0]?.total_tokens_used || 0),
        legacyUsed: Number(tokensTotals.rows[0]?.legacy_tokens_used || 0),
        legacyBudget: Number(tokensTotals.rows[0]?.legacy_token_budget || 0),
        legacyCappedCount: Number(tokensTotals.rows[0]?.legacy_capped_count || 0),
        byProject: tokensByProject.rows,
      },
      tokensByModel: tokensByModel.rows.map((r) => ({
        model: r.model,
        tokens: Number(r.tokens),
        count: r.count,
      })),
      events: {
        total: eventsTotal.rows[0]?.count || 0,
        byStage: eventsByStage.rows,
      },
      documents: {
        byVisibility: documentsByVisibility.rows,
      },
      tasks: {
        byStatus: tasksByStatus.rows,
      },
      users: {
        activeCount: activeUsers.rows[0]?.count || 0,
      },
      recentActivity: recentActivity.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
