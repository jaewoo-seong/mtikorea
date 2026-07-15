import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { checkpointOf, stageLabel, stopLabel } from '../lib/projectStage';

function ProgressBar({ value, live }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[11px] text-muted mb-1">
        <span>{live ? 'Live progress' : 'Progress'}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            live ? 'bg-gradient-to-r from-primary to-blue-400 animate-pulse' : 'bg-primary'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function statusStyle(status) {
  if (status === 'running') return 'bg-blue-100 text-primary';
  if (status === 'completed') return 'bg-emerald-100 text-success';
  if (status === 'paused') return 'bg-amber-100 text-amber-700';
  if (status === 'failed') return 'bg-red-100 text-danger';
  return 'bg-slate-100 text-muted';
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    title: '',
    goal: '',
    clientId: '',
    tokenBudget: 50000,
    allottedHours: 8,
    dueAt: '',
  });
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const [p, c] = await Promise.all([api.projects.list(), api.clients.list()]);
    setProjects(p.projects);
    setClients(c.clients);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const t = setInterval(() => load().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, []);

  async function create(e) {
    e.preventDefault();
    await api.projects.create({
      title: form.title,
      goal: form.goal,
      clientId: form.clientId || null,
      tokenBudget: Number(form.tokenBudget) || 50000,
      allottedHours: form.allottedHours !== '' ? Number(form.allottedHours) : null,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
    });
    setForm({ title: '', goal: '', clientId: '', tokenBudget: 50000, allottedHours: 8, dueAt: '' });
    setShowForm(false);
    await load();
  }

  async function removeProject(e, p) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${p.title}"? Logs and project files go away. Shared docs keep but unlink.`)) {
      return;
    }
    try {
      await api.projects.delete(p.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">Projects</h1>
          <p className="text-sm text-muted mt-1">
            Card workspace for agent jobs. Worker keeps running after browser close until Stop, hours, or due date.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : 'New project'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="card p-5 grid md:grid-cols-2 gap-3">
          <input className="input md:col-span-2" placeholder="Project title" required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select className="input" value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">Link client (optional)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input" type="number" min="1" step="0.5" placeholder="Allotted hours"
            value={form.allottedHours}
            onChange={(e) => setForm({ ...form, allottedHours: e.target.value })} />
          <label className="text-sm text-muted flex flex-col gap-1">
            Due date
            <input className="input" type="datetime-local" value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
          </label>
          <input className="input" type="number" value={form.tokenBudget}
            onChange={(e) => setForm({ ...form, tokenBudget: e.target.value })}
            placeholder="Token budget" />
          <textarea className="input md:col-span-2 min-h-[90px]" placeholder="Goal / brief"
            value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
          <button className="btn-primary md:col-span-2" type="submit">Create draft project</button>
        </form>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Link
            key={p.id}
            to={`/projects/${p.id}`}
            className="card p-5 hover:shadow-mid transition block group border border-line relative"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-lg group-hover:text-primary transition">{p.title}</h2>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`badge capitalize ${statusStyle(p.status)}`}>{p.status}</span>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-danger px-1.5 py-0.5 rounded"
                  title="Delete project"
                  onClick={(e) => removeProject(e, p)}
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="text-sm text-muted mt-2 line-clamp-2 min-h-[2.5rem]">{p.goal || 'No goal set'}</p>
            {(() => {
              const cp = checkpointOf(p);
              const stage = cp.stage || (p.status === 'running' ? 'queued' : null);
              if (!stage && !cp.detail && !p.last_error && !p.stop_reason) return null;
              const bad = stage === 'error' || stage === 'blocked' || p.stop_reason || p.last_error;
              return (
                <div
                  className={`mt-2 rounded-lg px-2.5 py-2 text-xs ${
                    bad
                      ? 'bg-red-50 text-danger'
                      : p.status === 'running'
                        ? 'bg-blue-50 text-primary'
                        : 'bg-slate-50 text-muted'
                  }`}
                >
                  <div className="font-semibold">
                    {p.stop_reason
                      ? stopLabel(p.stop_reason)
                      : stage
                        ? stageLabel(stage)
                        : 'Status'}
                    {cp.mode ? ` · ${cp.mode}` : ''}
                    {p.agent_iteration ? ` · iter ${p.agent_iteration}` : ''}
                  </div>
                  <div className="line-clamp-2 mt-0.5 opacity-90">
                    {p.last_error || cp.last_error || cp.detail || cp.last_summary || 'Waiting for worker…'}
                  </div>
                </div>
              );
            })()}
            <div className="flex flex-wrap gap-2 mt-3 text-xs">
              {p.client_name && <span className="badge bg-emerald-50 text-success">{p.client_name}</span>}
              {p.allotted_hours != null && (
                <span className="badge bg-slate-100 text-ink">{p.allotted_hours}h allotted</span>
              )}
              {p.due_at && (
                <span className="badge bg-amber-50 text-amber-800">
                  Due {new Date(p.due_at).toLocaleString()}
                </span>
              )}
            </div>
            <ProgressBar value={p.progressPct ?? p.progress_pct} live={p.status === 'running'} />
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
        ))}
      </div>
      {!projects.length && (
        <div className="card p-10 text-center text-muted text-sm">No projects yet. Create one to start the worker.</div>
      )}
    </div>
  );
}
