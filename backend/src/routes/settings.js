const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/stats', async (req, res, next) => {
  try {
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
           COALESCE(SUM(token_budget), 0)::bigint AS total_token_budget
         FROM projects WHERE org_id = $1`,
        [orgId]
      ),
      query(
        `SELECT id, title, tokens_used, token_budget
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
        totalBudget: Number(tokensTotals.rows[0]?.total_token_budget || 0),
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
