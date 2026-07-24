import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { checkpointOf, formatBudgetMinutes, stageLabel, stopLabel } from '../lib/projectStage';
import { IconClock } from '../lib/icons';
import ConfirmButton from '../components/ConfirmButton';
import { useToast } from '../components/Toast';

const STATUS_FILTERS = ['all', 'running', 'paused', 'draft', 'completed', 'failed'];

const STATUS_TAG = {
  running: 'badge-accent',
  paused: 'badge-outline',
  completed: 'badge-neutral',
  draft: 'badge-outline',
  failed: 'badge bg-red-50 text-danger',
};

function StatusTag({ status }) {
  return <span className={`${STATUS_TAG[status] || 'badge-neutral'} capitalize font-medium`}>{status}</span>;
}

function SkeletonCard() {
  return (
    <div className="card p-3 animate-pulse">
      <div className="h-3 w-1/3 bg-neutral-200" />
      <div className="h-5 w-2/3 bg-neutral-200 mt-3" />
      <div className="h-3 w-full bg-neutral-200 mt-3" />
      <div className="h-3 w-4/5 bg-neutral-200 mt-2" />
      <div className="h-2 w-full bg-neutral-200 mt-6" />
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

function dateLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
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
          <h1 className="text-3xl">Research projects</h1>
          <p className="text-sm text-muted mt-1">
            Give an agent a goal and a time budget. It works the problem continuously on the cloud
            until it hits the budget or you stop it.
          </p>
        </div>
        <Link className="btn-primary" to="/projects/new">+ New project</Link>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="flex flex-wrap items-center gap-4 justify-between border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-4">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`text-sm capitalize pb-1 border-b-2 -mb-[13px] transition ${
                statusFilter === s ? 'border-primary text-primary font-medium' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
          <input
            className="input py-1 text-xs w-48"
            placeholder="Search title / client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((p) => {
            const cp = checkpointOf(p);
            const stage = cp.stage || (p.status === 'running' ? 'queued' : null);
            const pct = Math.max(0, Math.min(100, Number(p.progressPct ?? p.progress_pct) || 0));
            const remainingMin =
              p.time_budget_minutes != null
                ? Math.max(0, p.time_budget_minutes - Math.round((pct / 100) * p.time_budget_minutes))
                : null;
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="card blueprint p-3 hover:border-primary group min-w-0">
                <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
                <div className="flex items-center justify-between gap-2">
                  <StatusTag status={p.status} />
                  <span className="text-[11px] text-muted shrink-0">{dateLabel(p.created_at)}</span>
                </div>
                <h2 className="card-title mt-1.5 truncate group-hover:text-primary transition">{p.title}</h2>
                <p className="card-body line-clamp-2 min-h-[2.2rem]">{p.goal || 'No goal set'}</p>

                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>{stage ? stageLabel(stage) : p.status === 'completed' ? 'Done' : '—'}</span>
                  <span>{p.creator_name || 'You'}</span>
                </div>

                {p.stop_reason && (
                  <div className="text-[11px] text-danger line-clamp-1">{stopLabel(p.stop_reason)}</div>
                )}

                <div className="pt-2 border-t border-line space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted inline-flex items-center gap-1">
                      <IconClock width={10} height={10} /> Time budget
                    </span>
                    <span className="font-mono">
                      {p.time_budget_minutes != null
                        ? `${formatBudgetMinutes(remainingMin)} left`
                        : p.allotted_hours != null
                          ? `${p.allotted_hours}h allotted (legacy)`
                          : 'No budget set'}
                    </span>
                  </div>
                  {p.time_budget_minutes != null && (
                    <div className="h-1 bg-neutral-200 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] pt-0.5">
                    <span className="text-muted">Tokens used</span>
                    <span className="font-mono">
                      {Number(p.tokens_used || 0).toLocaleString()}
                      {p.token_budget != null ? ` / ${Number(p.token_budget).toLocaleString()}` : ' (no cap)'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <ConfirmButton
                    onConfirm={() => removeProject(p)}
                    pending={deletingId === p.id}
                    pendingLabel="Deleting…"
                    className="text-xs text-muted hover:text-danger"
                  >
                    Delete
                  </ConfirmButton>
                  <span className="font-display font-semibold text-sm text-primary">Open ›</span>
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
