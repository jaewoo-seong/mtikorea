import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { checkpointOf, formatBudgetMinutes, stageLabel, stageTone, stopLabel, toneClasses } from '../lib/projectStage';
import { IconAlert, IconCheck, IconClock, IconLoader, IconSearch } from '../lib/icons';
import ConfirmButton from '../components/ConfirmButton';
import { useToast } from '../components/Toast';

function ProgressBar({ value, live }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-muted mb-1">
        <span className="font-medium text-ink">{live ? 'Live progress' : 'Progress'}</span>
        <span className="font-mono font-semibold">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            live ? 'bg-gradient-to-r from-primary via-blue-400 to-primary bg-[length:200%_100%] animate-pulse' : 'bg-primary'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const STATUS_FILTERS = ['all', 'running', 'paused', 'draft', 'completed', 'failed'];

function StatusPill({ status }) {
  const styles = {
    running: 'bg-blue-100 text-primary',
    completed: 'bg-emerald-100 text-success',
    paused: 'bg-amber-100 text-amber-700',
    failed: 'bg-red-100 text-danger',
    draft: 'bg-slate-100 text-muted',
  };
  const icon = {
    running: <IconLoader width={12} height={12} />,
    completed: <IconCheck width={12} height={12} />,
    failed: <IconAlert width={12} height={12} />,
  }[status];
  return (
    <span className={`badge capitalize inline-flex items-center gap-1 font-semibold ${styles[status] || styles.draft}`}>
      {icon}
      {status}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="h-5 w-2/3 bg-slate-100 rounded" />
      <div className="h-3 w-full bg-slate-100 rounded mt-3" />
      <div className="h-3 w-4/5 bg-slate-100 rounded mt-2" />
      <div className="h-2.5 w-full bg-slate-100 rounded-full mt-6" />
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="h-10 bg-slate-100 rounded-lg" />
        <div className="h-10 bg-slate-100 rounded-lg" />
        <div className="h-10 bg-slate-100 rounded-lg" />
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return null;
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 3) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [, forceTick] = useState(0);
  const toast = useToast();

  async function load() {
    const p = await api.projects.list();
    setProjects(p.projects);
    setLastRefresh(Date.now());
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const t = setInterval(() => load().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, []);

  // Tick every second so the "updated Xs ago" label stays fresh without refetching.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function removeProject(p) {
    setDeletingId(p.id);
    try {
      await api.projects.delete(p.id);
      toast.success(`Deleted "${p.title}"`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (q && !`${p.title} ${p.client_name || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, statusFilter, search]);

  const loading = projects === null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">Projects</h1>
          <p className="text-sm text-muted mt-1">
            Card workspace for agent jobs. Worker keeps running after browser close until time
            budget or Stop — no cap on how many run at once.
          </p>
        </div>
        <Link className="btn-primary" to="/projects/new">New project</Link>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize border transition ${
                statusFilter === s
                  ? 'border-primary bg-blue-50 text-primary'
                  : 'border-line bg-white text-muted hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
          <div className="relative">
            <IconSearch width={14} height={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input pl-8 py-1.5 text-xs w-48"
              placeholder="Search title / client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {!loading && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/50" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Updated {timeAgo(lastRefresh) || 'just now'}
          </div>
        )}
      </div>

      {loading && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const cp = checkpointOf(p);
            const stage = cp.stage || (p.status === 'running' ? 'queued' : null);
            const tc = toneClasses(stageTone(stage));
            return (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="card p-5 hover:shadow-mid transition block group border border-line relative min-w-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-lg group-hover:text-primary transition truncate">{p.title}</h2>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill status={p.status} />
                    <ConfirmButton
                      onConfirm={() => removeProject(p)}
                      pending={deletingId === p.id}
                      pendingLabel="Deleting…"
                      className="text-xs text-muted hover:text-danger px-1.5 py-0.5 rounded"
                    >
                      Delete
                    </ConfirmButton>
                  </div>
                </div>
                <p className="text-sm text-muted mt-2 line-clamp-2 min-h-[2.5rem]">{p.goal || 'No goal set'}</p>

                <ProgressBar value={p.progressPct ?? p.progress_pct} live={p.status === 'running'} />

                {(() => {
                  if (!stage && !cp.detail && !p.last_error && !p.stop_reason) return null;
                  return (
                    <div className={`mt-3 rounded-lg px-2.5 py-2 text-xs ${tc.badge} bg-opacity-60`}>
                      <div className="font-semibold flex items-start gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${tc.dot} ${p.status === 'running' ? 'animate-pulse' : ''}`} />
                        <span className="min-w-0">
                          {p.stop_reason ? stopLabel(p.stop_reason) : stage ? stageLabel(stage) : 'Status'}
                          {cp.mode ? ` · ${cp.mode}` : ''}
                          {p.agent_iteration ? ` · iter ${p.agent_iteration}` : ''}
                        </span>
                      </div>
                      <div className="line-clamp-2 mt-0.5 opacity-90">
                        {p.last_error || cp.last_error || cp.detail || cp.last_summary || 'Waiting for worker…'}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap gap-2 mt-3 text-xs">
                  {p.client_name && <span className="badge bg-emerald-50 text-success">{p.client_name}</span>}
                  {p.time_budget_minutes != null && (
                    <span className="badge bg-slate-100 text-ink inline-flex items-center gap-1">
                      <IconClock width={11} height={11} />
                      {formatBudgetMinutes(p.time_budget_minutes)} budget
                    </span>
                  )}
                  {p.time_budget_minutes == null && p.allotted_hours != null && (
                    <span className="badge bg-slate-100 text-ink inline-flex items-center gap-1">
                      <IconClock width={11} height={11} />
                      {p.allotted_hours}h allotted
                    </span>
                  )}
                  {p.due_at && (
                    <span className="badge bg-amber-50 text-amber-800">
                      Due {new Date(p.due_at).toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted">
                  <div className="rounded-lg bg-slate-50 py-2">
                    <div className="font-semibold text-ink">{p.file_count || 0}</div>
                    files
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2">
                    <div className="font-semibold text-ink">{p.document_count || 0}</div>
                    docs
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2">
                    <div className="font-semibold text-ink">{p.log_count || 0}</div>
                    logs
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!loading && !projects.length && (
        <div className="card p-10 text-center text-muted text-sm">No projects yet. Create one to start the worker.</div>
      )}
      {!loading && !!projects.length && !filtered.length && (
        <div className="card p-10 text-center text-muted text-sm">No projects match this filter/search.</div>
      )}
    </div>
  );
}
