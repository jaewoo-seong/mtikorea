import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  PIPELINE,
  buildDiagnostics,
  checkpointOf,
  pipelineIndex,
  stageLabel,
} from '../lib/projectStage';

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
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [schedule, setSchedule] = useState({ allottedHours: '', dueAt: '' });
  const [taskTitle, setTaskTitle] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  async function addTask(e) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    await api.tasks.create({
      title: taskTitle.trim(),
      projectId: id,
      clientId: data.project.client_id || null,
    });
    setTaskTitle('');
    setMsg('Task linked to this project');
    await load();
  }

  async function sendChat(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    await api.projects.sendMessage(id, chatInput.trim());
    setChatInput('');
    await load();
  }

  async function approveDoc(docId) {
    await api.documents.approve(docId);
    setMsg('Document approved → Shared docs');
    await load();
  }

  async function rejectDoc(docId) {
    await api.documents.reject(docId);
    setMsg('Staged document discarded');
    await load();
  }

  async function removeProject() {
    const title = data?.project?.title || 'this project';
    if (!window.confirm(`Delete "${title}"? Work logs and project files cascade-delete. Shared docs stay (unlink).`)) {
      return;
    }
    setDeleting(true);
    try {
      await api.projects.delete(id);
      navigate('/projects');
    } catch (e) {
      setMsg(e.message);
      setDeleting(false);
    }
  }

  if (!data) return <div className="text-sm text-muted">{msg || 'Loading…'}</div>;
  const {
    project,
    files,
    documents = [],
    stagedDocuments = [],
    messages = [],
    tasks = [],
    logs,
    results,
  } = data;
  const live = project.status === 'running';
  const errors = messages.filter((m) => m.role === 'error');
  const cp = checkpointOf(project);
  const diagnostics = buildDiagnostics(project, logs, errors);
  const activeStage = cp.stage || (live ? 'queued' : project.status === 'completed' ? 'done' : 'idle');
  const activeIdx = pipelineIndex(activeStage);
  const displayPipeline = PIPELINE.filter((s) =>
    ['queued', 'planning', 'sub_agents', 'synthesizing', 'persisting', 'idle'].includes(s.id)
  );

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
            <span
              className={`badge ${
                activeStage === 'error' || activeStage === 'blocked'
                  ? 'bg-red-100 text-danger'
                  : live
                    ? 'bg-blue-100 text-primary'
                    : 'bg-slate-100'
              }`}
            >
              Stage: {stageLabel(activeStage)}
            </span>
            {cp.mode && <span className="badge bg-violet-50 text-violet-700">Mode: {cp.mode}</span>}
            {project.overdue && <span className="badge bg-red-100 text-danger">Past due</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(project.status === 'draft' || project.status === 'paused') && (
            <button type="button" className="btn-primary" onClick={start}>Start worker</button>
          )}
          {live && <button type="button" className="btn-danger" onClick={stop}>Stop</button>}
          {project.status !== 'completed' && (
            <button type="button" className="btn-secondary" onClick={() => api.projects.complete(id).then(load)}>
              Mark complete
            </button>
          )}
          <button type="button" className="btn-ghost text-danger" disabled={deleting} onClick={removeProject}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
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
            <div className="mt-1 font-semibold">
              {documents.length} shared · {stagedDocuments.length} pending
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4 border border-line">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Agent stage report</h2>
            <p className="text-xs text-muted mt-0.5">
              Live pipeline · polls every ~2.5s
              {cp.stage_at ? ` · updated ${new Date(cp.stage_at).toLocaleString()}` : ''}
            </p>
          </div>
          {cp.status && (
            <span className="badge bg-slate-100 font-mono text-xs">agent: {cp.status}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {displayPipeline.map((s, idx) => {
            const current = s.id === activeStage;
            const done = activeIdx >= 0 && idx < activeIdx && !['error', 'blocked'].includes(activeStage);
            return (
              <div
                key={s.id}
                className={`rounded-lg px-3 py-2 text-xs border min-w-[6.5rem] ${
                  current
                    ? 'border-primary bg-blue-50 text-primary font-semibold'
                    : done
                      ? 'border-emerald-200 bg-emerald-50/80 text-success'
                      : 'border-line bg-slate-50 text-muted'
                }`}
              >
                <div className="uppercase tracking-wide text-[10px] opacity-70">{idx + 1}</div>
                {s.label}
                {current && live && <span className="ml-1 animate-pulse">●</span>}
              </div>
            );
          })}
          {(['error', 'blocked', 'done'].includes(activeStage)) && (
            <div
              className={`rounded-lg px-3 py-2 text-xs border min-w-[6.5rem] font-semibold ${
                activeStage === 'done'
                  ? 'border-emerald-200 bg-emerald-50 text-success'
                  : 'border-red-200 bg-red-50 text-danger'
              }`}
            >
              {stageLabel(activeStage)}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-slate-50 border border-line p-3 text-sm space-y-2">
          <div>
            <span className="text-xs text-muted">Now</span>
            <p className="mt-0.5 whitespace-pre-wrap">{cp.detail || 'No stage detail yet'}</p>
          </div>
          {cp.last_summary && (
            <div className="border-t border-line pt-2">
              <span className="text-xs text-muted">Last summary</span>
              <p className="mt-0.5 whitespace-pre-wrap text-muted">{cp.last_summary}</p>
            </div>
          )}
          {cp.next_focus && (
            <div className="border-t border-line pt-2">
              <span className="text-xs text-muted">Next focus</span>
              <p className="mt-0.5">{cp.next_focus}</p>
            </div>
          )}
          <div className="border-t border-line pt-2 grid sm:grid-cols-3 gap-2 text-xs text-muted">
            <div>Cycle #{cp.last_step || cp.cycle || '—'}</div>
            <div>Model: {cp.main_model || '—'}</div>
            <div>
              Subs:{' '}
              {cp.sub_ok != null ? `${cp.sub_ok} ok / ${cp.sub_fail || 0} fail` : cp.subtask_count != null ? `${cp.subtask_count} queued` : '—'}
            </div>
            {cp.current_sub && (
              <div className="sm:col-span-3 text-primary">
                Active sub: {cp.current_sub.role} → {cp.current_sub.model} ({cp.current_sub.index}/{cp.current_sub.of})
              </div>
            )}
            {cp.cycle_ms != null && <div>Last cycle: {Math.round(Number(cp.cycle_ms) / 1000)}s</div>}
            {project.claimed_by && (
              <div className="sm:col-span-2 font-mono truncate">Claimed: {project.claimed_by}</div>
            )}
          </div>
        </div>

        {!!diagnostics.length && (
          <div className="space-y-2">
            {diagnostics.map((d, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${
                  d.level === 'error'
                    ? 'bg-red-50 text-danger border border-red-100'
                    : d.level === 'warn'
                      ? 'bg-amber-50 text-amber-900 border border-amber-100'
                      : 'bg-slate-50 text-muted border border-line'
                }`}
              >
                {d.text}
              </div>
            ))}
          </div>
        )}

        {!!errors.length && (
          <div className="border-t border-line pt-3 space-y-2">
            <div className="font-semibold text-danger text-sm">Recent errors</div>
            {errors.slice(-8).map((m) => (
              <div key={m.id} className="text-danger/90 text-xs whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2">
                <div className="text-[10px] text-muted mb-1">{new Date(m.created_at).toLocaleString()}</div>
                {m.error_code && <span className="font-mono mr-2">[{m.error_code}]</span>}
                {m.content}
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-line pt-3">
          <div className="font-semibold text-sm mb-2">Phase timeline (latest 12)</div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {[...logs].reverse().slice(0, 12).map((l) => (
              <div key={l.id} className="text-xs pl-3 border-l-2 border-primary/25">
                <div className="font-mono text-muted">
                  #{l.step_number} · {l.phase}/{l.action}
                  {l.sub_agent ? ` · ${l.sub_agent}` : ''}
                </div>
                <div className="whitespace-pre-wrap line-clamp-3 mt-0.5">{l.detail}</div>
              </div>
            ))}
            {!logs.length && <p className="text-xs text-muted">No work log yet</p>}
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

      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="btn-secondary" to={`/documents?projectId=${id}`}>All documents →</Link>
        <Link className="btn-secondary" to={`/tasks?projectId=${id}`}>All tasks →</Link>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold">Human tasks on this project</h2>
          <form onSubmit={addTask} className="flex gap-2 flex-1 min-w-[240px] max-w-md">
            <input className="input" placeholder="Add follow-up task…" value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)} />
            <button className="btn-primary shrink-0" type="submit">Add</button>
          </form>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-xl border border-line p-3 bg-slate-50/80">
              <div className="flex justify-between gap-2">
                <div className="font-medium text-sm">{t.title}</div>
                <span className="badge bg-white capitalize text-xs">{t.status}</span>
              </div>
              <div className="text-xs text-muted mt-1">{t.assignee_name || 'Unassigned'}</div>
            </div>
          ))}
          {!tasks.length && <p className="text-sm text-muted md:col-span-2">No human tasks yet — agent work is separate</p>}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5 flex flex-col min-h-[420px]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Agent chat / responses</h2>
            {live && <span className="badge bg-blue-100 text-primary animate-pulse">live</span>}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto max-h-[360px] mb-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-blue-50 text-ink ml-8'
                    : m.role === 'error'
                      ? 'bg-red-50 text-danger'
                      : 'bg-slate-50 text-ink mr-8'
                }`}
              >
                <div className="text-[10px] uppercase tracking-wide text-muted mb-1">{m.role}</div>
                {m.content}
                {m.document_id && (
                  <div className="text-xs text-primary mt-1">Doc: {m.document_title || m.document_id}</div>
                )}
              </div>
            ))}
            {!messages.length && (
              <p className="text-sm text-muted">Chat with the agent here. Background worker also posts responses + staged docs.</p>
            )}
          </div>
          <form onSubmit={sendChat} className="flex gap-2 border-t border-line pt-3">
            <input className="input" placeholder="Ask the agent / add instructions…" value={chatInput}
              onChange={(e) => setChatInput(e.target.value)} />
            <button className="btn-primary shrink-0" type="submit">Send</button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold mb-1">Pending approval (hidden staging)</h2>
            <p className="text-xs text-muted mb-3">Agent outputs stay here until you approve → Shared docs.</p>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {stagedDocuments.map((d) => (
                <div key={d.id} className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2">
                  <div className="text-sm font-medium">{d.title}</div>
                  <div className="text-xs text-muted mt-0.5 line-clamp-2">{d.description}</div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" className="btn-primary text-xs py-1" onClick={() => approveDoc(d.id)}>Approve</button>
                    <button type="button" className="btn-ghost text-xs py-1 text-danger" onClick={() => rejectDoc(d.id)}>Reject</button>
                    <a className="btn-ghost text-xs py-1" href={`/api/documents/${d.id}/download`}>Preview</a>
                  </div>
                </div>
              ))}
              {!stagedDocuments.length && <p className="text-sm text-muted">No staged outputs yet</p>}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold mb-3">Approved on this project</h2>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {documents.map((d) => (
                <a key={d.id} href={`/api/documents/${d.id}/download`} className="block rounded-lg border border-line px-3 py-2 hover:bg-slate-50 text-sm">
                  <div className="font-medium truncate">{d.title}</div>
                  <div className="text-xs text-muted">Shared doc ID = title</div>
                </a>
              ))}
              {!documents.length && <p className="text-sm text-muted">Approve staged docs to publish here + Shared docs</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Context uploads</h2>
            <input type="file" multiple className="text-xs" onChange={onUpload} disabled={live} />
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {files.map((f) => (
              <a key={f.id} href={`/api/projects/${id}/files/${f.id}/download`}
                className="flex justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:bg-slate-50">
                <span className="truncate">{f.filename}</span>
                <span className="text-xs text-muted">{Math.round((f.size_bytes || 0) / 1024)} KB</span>
              </a>
            ))}
            {!files.length && <p className="text-sm text-muted">Upload briefing files before Start</p>}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Work log</h2>
            {live && <span className="badge bg-blue-100 text-primary animate-pulse">streaming</span>}
          </div>
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {[...logs].reverse().slice(0, 40).map((l) => (
              <div key={l.id} className="pl-3 border-l-2 border-primary/30">
                <div className="text-[11px] text-muted font-mono">#{l.step_number} · {l.action}</div>
                <div className="text-sm whitespace-pre-wrap line-clamp-4">{l.detail}</div>
              </div>
            ))}
            {!logs.length && <p className="text-sm text-muted">No steps until Start</p>}
          </div>
          {!!results.length && (
            <div className="mt-3 pt-3 border-t border-line text-xs text-muted">{results.length} finding snapshots</div>
          )}
        </div>
      </div>
    </div>
  );
}
