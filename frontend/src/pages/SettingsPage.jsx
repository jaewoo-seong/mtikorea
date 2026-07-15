import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { stageLabel } from '../lib/projectStage';
import { IconAlert, IconClock, IconLoader, IconUsers } from '../lib/icons';

function pct(used, total) {
  const u = Number(used) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.min(100, Math.round((u / t) * 100));
}

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono mt-1 text-lg">{value}</div>
      {sub != null && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function StatusList({ title, rows, labelKey = 'status' }) {
  const total = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
  return (
    <div className="card p-5 space-y-3">
      <div className="font-semibold">{title}</div>
      {!rows.length && <div className="text-sm text-muted">No data yet</div>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r[labelKey] || 'unknown'} className="flex items-center justify-between text-sm">
            <span className="capitalize text-muted">{r[labelKey] || 'unknown'}</span>
            <span className="font-mono">
              {r.count} <span className="text-[11px] text-muted">({pct(r.count, total)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.settings
      .stats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load stats');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <div className="flex items-center gap-2 text-sm text-muted">
          <IconLoader width={16} height={16} />
          Loading stats…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <div className="card p-5 border border-red-200 bg-red-50 flex items-center gap-2 text-sm text-danger">
          <IconAlert width={18} height={18} />
          {error}
        </div>
      </div>
    );
  }

  const projects = stats?.projects || { total: 0, byStatus: [] };
  const tokens = stats?.tokens || { totalUsed: 0, totalBudget: 0, byProject: [] };
  const tokensByModel = stats?.tokensByModel || [];
  const events = stats?.events || { total: 0, byStage: [] };
  const documents = stats?.documents || { byVisibility: [] };
  const tasks = stats?.tasks || { byStatus: [] };
  const users = stats?.users || { activeCount: 0 };
  const recentActivity = stats?.recentActivity || [];

  const docsTotal = documents.byVisibility.reduce((s, r) => s + Number(r.count || 0), 0);
  const tasksTotal = tasks.byStatus.reduce((s, r) => s + Number(r.count || 0), 0);
  const tokenPct = pct(tokens.totalUsed, tokens.totalBudget);
  const maxModelTokens = Math.max(1, ...tokensByModel.map((m) => Number(m.tokens) || 0));
  const maxEventCount = Math.max(1, ...events.byStage.map((e) => Number(e.count) || 0));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="text-sm text-muted mt-1">Operational overview — token usage, agent activity, and system stats.</p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
          <Tile label="Total projects" value={projects.total} />
          <Tile
            label="Tokens used / budget"
            value={`${tokens.totalUsed.toLocaleString()}/${tokens.totalBudget.toLocaleString()}`}
            sub={`${tokenPct}% of budget`}
          />
          <Tile label="Documents" value={docsTotal} />
          <Tile label="Tasks" value={tasksTotal} />
          <Tile label="Active users" value={users.activeCount} />
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${tokenPct}%` }}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5 space-y-3">
          <div className="font-semibold">Token usage by project</div>
          {!tokens.byProject.length && <div className="text-sm text-muted">No projects yet</div>}
          <div className="space-y-3">
            {tokens.byProject.map((p) => {
              const p2 = pct(p.tokens_used, p.token_budget);
              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2">{p.title}</span>
                    <span className="font-mono text-xs text-muted shrink-0">
                      {Number(p.tokens_used).toLocaleString()}/{Number(p.token_budget).toLocaleString()} ({p2}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${p2 >= 100 ? 'bg-danger' : 'bg-primary'}`}
                      style={{ width: `${p2}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5 space-y-3">
          <div className="font-semibold">Token usage by model</div>
          {!tokensByModel.length && <div className="text-sm text-muted">No model events yet</div>}
          <div className="space-y-3">
            {tokensByModel.map((m) => (
              <div key={m.model} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 font-mono text-xs">{m.model}</span>
                  <span className="text-xs text-muted shrink-0">
                    {m.tokens.toLocaleString()} tok · {m.count} events
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((m.tokens / maxModelTokens) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <StatusList title="Projects by status" rows={projects.byStatus} />
        <StatusList title="Documents by visibility" rows={documents.byVisibility} labelKey="visibility" />
        <StatusList title="Tasks by status" rows={tasks.byStatus} />
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Agent events by stage</div>
          <div className="text-xs text-muted">{events.total.toLocaleString()} total events</div>
        </div>
        {!events.byStage.length && <div className="text-sm text-muted">No agent events yet</div>}
        <div className="space-y-2">
          {events.byStage.map((e) => (
            <div key={e.stage || 'unknown'} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{stageLabel(e.stage)}</span>
                <span className="font-mono text-xs text-muted">{e.count}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((e.count / maxEventCount) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="font-semibold flex items-center gap-2">
          <IconClock width={16} height={16} />
          Recent activity
        </div>
        {!recentActivity.length && <div className="text-sm text-muted">No activity yet</div>}
        <div className="space-y-2">
          {recentActivity.map((a, i) => (
            <div key={i} className="rounded-lg border border-line px-3 py-2 text-sm flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{stageLabel(a.stage)}</span>
                  {a.action && <span className="text-xs text-muted">{a.action}</span>}
                  {a.project_title && (
                    <span className="text-xs text-muted truncate">· {a.project_title}</span>
                  )}
                </div>
                {a.summary && <div className="text-xs text-muted mt-0.5 truncate">{a.summary}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-muted">{new Date(a.created_at).toLocaleString()}</div>
                {a.model && <div className="text-[11px] font-mono text-muted">{a.model}</div>}
                {a.tokens_used != null && (
                  <div className="text-[11px] font-mono">{Number(a.tokens_used).toLocaleString()} tok</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!projects.total && (
        <div className="card p-5 flex items-center gap-2 text-sm text-muted">
          <IconUsers width={16} height={16} />
          This organization has no projects yet — stats will populate as agents run.
        </div>
      )}
    </div>
  );
}
