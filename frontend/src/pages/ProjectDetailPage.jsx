import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

function ProgressBar({ value, live }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="flex justify-between text-xs text-muted mb-1.5">
        <span className="font-medium text-ink">{live ? 'Live progress' : 'Progress'}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
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

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [schedule, setSchedule] = useState({ allottedHours: '', dueAt: '' });

  async function load() {
    const d = await api.projects.get(id);
    setData(d);
    setSchedule({
      allottedHours: d.project.allotted_hours ?? '',
      dueAt: d.project.due_at ? new Date(d.project.due_at).toISOString().slice(0, 16) : '',
    });
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    const t = setInterval(() => load().catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [id]);

  async function start() {
    await api.projects.start(id);
    setMsg('Worker claimed — agents run until Stop / hours / due date');
    await load();
  }

  async function stop() {
    await api.projects.stop(id);
    setMsg('Paused');
    await load();
  }

  async function saveSchedule(e) {
    e.preventDefault();
    await api.projects.update(id, {
      allottedHours: schedule.allottedHours === '' ? null : Number(schedule.allottedHours),
      dueAt: schedule.dueAt ? new Date(schedule.dueAt).toISOString() : null,
    });
    setMsg('Schedule updated');
    await load();
  }

  async function onUpload(e) {
    const files = e.target.files;
    if (!files?.length) return;
    await api.projects.upload(id, files);
    setMsg(`Uploaded ${files.length} file(s)`);
    e.target.value = '';
    await load();
  }

  if (!data) return <div className="text-sm text-muted">{msg || 'Loading…'}</div>;
  const { project, files, documents = [], logs, results } = data;
  const live = project.status === 'running';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/projects" className="text-sm text-muted hover:text-primary">← Projects</Link>
          <h1 className="font-display text-3xl font-semibold mt-2">{project.title}</h1>
          <p className="text-sm text-muted mt-1 max-w-3xl">{project.goal}</p>
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            {project.client_name && (
              <Link to={`/clients/${project.client_id}`} className="badge bg-emerald-50 text-success hover:underline">
                {project.client_name}
              </Link>
            )}
            <span className="badge bg-slate-100 capitalize">{project.status}</span>
            {project.overdue && <span className="badge bg-red-100 text-danger">Past due</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {(project.status === 'draft' || project.status === 'paused') && (
            <button type="button" className="btn-primary" onClick={start}>Start worker</button>
          )}
          {live && <button type="button" className="btn-danger" onClick={stop}>Stop</button>}
          {project.status !== 'completed' && (
            <button type="button" className="btn-secondary" onClick={() => api.projects.complete(id).then(load)}>
              Mark complete
            </button>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <ProgressBar value={project.progressPct ?? project.progress_pct} live={live} />
        <div className="grid sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-muted">Tokens</div>
            <div className="font-mono mt-1">{project.tokens_used}/{project.token_budget}</div>
            <div className="text-[11px] text-muted">{project.tokenPct ?? 0}% of budget</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-muted">Hours used / allotted</div>
            <div className="font-mono mt-1">
              {project.timePct != null ? `${project.timePct}%` : '—'}
              {project.allotted_hours != null ? ` of ${project.allotted_hours}h` : ''}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-muted">Due</div>
            <div className="mt-1 text-sm">
              {project.due_at ? new Date(project.due_at).toLocaleString() : 'No due date'}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-muted">Outputs</div>
            <div className="mt-1 font-semibold">{(files?.length || 0) + (documents?.length || 0)} docs</div>
          </div>
        </div>
      </div>

      <form onSubmit={saveSchedule} className="card p-5 grid md:grid-cols-3 gap-3 items-end">
        <label className="text-sm">
          <span className="text-muted text-xs">Allotted hours</span>
          <input className="input mt-1" type="number" min="0.5" step="0.5"
            value={schedule.allottedHours}
            onChange={(e) => setSchedule({ ...schedule, allottedHours: e.target.value })}
            disabled={live} />
        </label>
        <label className="text-sm">
          <span className="text-muted text-xs">Due date</span>
          <input className="input mt-1" type="datetime-local"
            value={schedule.dueAt}
            onChange={(e) => setSchedule({ ...schedule, dueAt: e.target.value })}
            disabled={live} />
        </label>
        <button className="btn-secondary" type="submit" disabled={live}>Save schedule</button>
      </form>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Project files</h2>
            <input type="file" multiple className="text-xs" onChange={onUpload} disabled={live} />
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {files.map((f) => (
              <a
                key={f.id}
                href={`/api/projects/${id}/files/${f.id}/download`}
                className="flex justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:bg-slate-50"
              >
                <span className="truncate">{f.filename}</span>
                <span className="text-xs text-muted shrink-0">{Math.round((f.size_bytes || 0) / 1024)} KB</span>
              </a>
            ))}
            {!files.length && <p className="text-sm text-muted">No uploads yet</p>}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Generated / shared documents</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {documents.map((d) => (
              <a
                key={d.id}
                href={`/api/documents/${d.id}/download`}
                className="block rounded-lg border border-line px-3 py-2 hover:bg-slate-50"
              >
                <div className="text-sm font-medium truncate">{d.title}</div>
                <div className="text-xs text-muted truncate mt-0.5">{d.description || d.filename}</div>
              </a>
            ))}
            {!documents.length && <p className="text-sm text-muted">Worker reports appear here as the job runs</p>}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Reports & findings</h2>
          <div className="space-y-3 max-h-[420px] overflow-y-auto">
            {results.map((r) => (
              <div key={r.id} className="rounded-xl border border-line p-4 bg-gradient-to-br from-white to-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{r.title}</div>
                  <span className="badge bg-blue-50 text-primary">{r.category}</span>
                </div>
                <p className="text-sm text-muted mt-2 whitespace-pre-wrap">{r.summary}</p>
                <div className="text-[11px] text-muted mt-2">{new Date(r.created_at).toLocaleString()}</div>
              </div>
            ))}
            {!results.length && <p className="text-sm text-muted">No findings yet — Start the worker</p>}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Live work log</h2>
            {live && <span className="badge bg-blue-100 text-primary animate-pulse">streaming</span>}
          </div>
          <div className="space-y-3 max-h-[420px] overflow-y-auto">
            {[...logs].reverse().map((l) => (
              <div key={l.id} className="relative pl-4 border-l-2 border-primary/30">
                <div className="text-[11px] text-muted font-mono">
                  #{l.step_number} · {l.phase} · {l.action}
                  {l.tokens_used ? ` · ${l.tokens_used} tok` : ''}
                  {l.duration_ms != null ? ` · ${l.duration_ms}ms` : ''}
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap">{l.detail}</div>
                <div className="text-[11px] text-muted mt-1">{new Date(l.created_at).toLocaleString()}</div>
              </div>
            ))}
            {!logs.length && <p className="text-sm text-muted">No agent activity until Start</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
