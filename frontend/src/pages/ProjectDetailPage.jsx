import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  PIPELINE,
  buildDiagnostics,
  checkpointOf,
  latestEventStage,
  pipelineIndex,
  stageLabel,
  stageTone,
  stopLabel,
  toneClasses,
} from '../lib/projectStage';
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconLightbulb,
  IconLoader,
  IconMessage,
  IconSearch,
  IconUsers,
  IconX,
} from '../lib/icons';

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

function DeleteButton({ onConfirm, deleting }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (armed) {
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          className="btn-danger text-xs"
          disabled={deleting}
          onClick={onConfirm}
        >
          {deleting ? 'Deleting…' : 'Confirm delete'}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setArmed(false)}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="btn-ghost text-danger" onClick={() => setArmed(true)}>
      Delete
    </button>
  );
}

/** One mini-card per sub-agent role currently running in this cycle's sub_agents stage. */
function subAgentCards(events, cycle) {
  const byRole = new Map();
  for (const e of events) {
    if (e.stage !== 'sub_agents' || !e.role || e.cycle !== cycle) continue;
    if (!byRole.has(e.role)) byRole.set(e.role, e); // events are newest-first: first hit per role = latest
  }
  return [...byRole.values()];
}

function SubAgentCard({ e }) {
  const isErr = e.status === 'error';
  const isOk = e.status === 'ok';
  const isRunning = e.status === 'started';
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${
        isErr ? 'border-red-200 bg-red-50' : isOk ? 'border-emerald-200 bg-emerald-50/60' : 'border-line bg-white'
      }`}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        {isRunning && <IconLoader width={12} height={12} className="text-primary" />}
        {isOk && <IconCheck width={12} height={12} className="text-success" />}
        {isErr && <IconAlert width={12} height={12} className="text-danger" />}
        <span className="capitalize">{e.role}</span>
      </div>
      <div className="font-mono text-[10px] text-muted mt-0.5 truncate">{e.model}</div>
      <div className="text-muted mt-1">
        {isRunning ? 'running…' : isOk ? `${e.tokens_used || 0} tok · ${e.duration_ms ?? '—'}ms` : 'failed'}
      </div>
    </div>
  );
}

const MEMORY_ROWS = [
  { key: 'now', icon: IconMessage, label: 'Now' },
  { key: 'last_summary', icon: IconCheck, label: 'Last summary' },
  { key: 'next_focus', icon: IconArrowRight, label: 'Next focus' },
  { key: 'last_critique', icon: IconAlert, label: 'Last critique (rethink)' },
  { key: 'idea_backlog', icon: IconLightbulb, label: 'Idea backlog' },
];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [schedule, setSchedule] = useState({ allottedHours: '', dueAt: '' });
  const [taskTitle, setTaskTitle] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [stageFilter, setStageFilter] = useState('all');
  const [eventSearch, setEventSearch] = useState('');
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [collapsedCycles, setCollapsedCycles] = useState(() => new Set());

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
  }, [id]);

  useEffect(() => {
    const running = data?.project?.status === 'running';
    const t = setInterval(() => load().catch(() => {}), running ? 1500 : 4000);
    return () => clearInterval(t);
  }, [id, data?.project?.status]);

  async function start() {
    await api.projects.start(id);
    setMsg('Worker looping until token budget / rate limit / Stop');
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
    events = [],
  } = data;
  const live = project.status === 'running';
  const errors = messages.filter((m) => m.role === 'error');
  const cp = checkpointOf(project);
  const diagnostics = buildDiagnostics(project, logs, errors, events);
  const activeStage = latestEventStage(events, project);
  const activeIdx = pipelineIndex(activeStage);
  const displayPipeline = PIPELINE.filter((s) =>
    ['planning', 'sub_agents', 'synthesis', 'review', 'saving'].includes(s.id)
  );
  const currentCycle = events[0]?.cycle ?? cp.cycle ?? 0;
  const subCards = subAgentCards(events, currentCycle);
  const headerToneClasses = toneClasses(stageTone(activeStage));

  const q = eventSearch.trim().toLowerCase();
  const filteredEvents = events.filter((e) => {
    if (stageFilter !== 'all' && e.stage !== stageFilter) return false;
    if (q) {
      const hay = `${e.summary || ''} ${e.detail || ''} ${e.action || ''} ${e.role || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const eventGroups = [];
  const cycleOccurrence = new Map();
  for (const e of filteredEvents) {
    const last = eventGroups[eventGroups.length - 1];
    if (last && last.cycle === e.cycle) {
      last.items.push(e);
      continue;
    }
    // Same cycle number can recur in non-adjacent stretches (e.g. control events); disambiguate
    // with an occurrence count so group ids stay stable and unique across renders.
    const occurrence = cycleOccurrence.get(e.cycle) || 0;
    cycleOccurrence.set(e.cycle, occurrence + 1);
    eventGroups.push({ id: `${e.cycle}-${occurrence}`, cycle: e.cycle, items: [e] });
  }
  function toggleCycle(groupId) {
    setCollapsedCycles((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/projects" className="text-sm text-muted hover:text-primary">← Projects</Link>
          <h1 className="font-display text-3xl font-semibold mt-2">{project.title}</h1>
          <p className="text-sm text-muted mt-1 max-w-3xl">{project.goal}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
            <span
              className={`badge inline-flex items-center gap-1.5 font-semibold ${headerToneClasses.badge}`}
            >
              {live && <IconLoader width={12} height={12} />}
              Stage: {stageLabel(activeStage)}
            </span>
            <span className="badge bg-slate-100 capitalize">{project.status}</span>
            {project.client_name && (
              <Link to={`/clients/${project.client_id}`} className="badge bg-emerald-50 text-success hover:underline">
                {project.client_name}
              </Link>
            )}
            {project.overdue && (
              <span className="badge bg-red-100 text-danger inline-flex items-center gap-1">
                <IconAlert width={11} height={11} />
                Past due
              </span>
            )}
            {cp.mode && <span className="badge bg-slate-50 text-muted">Mode: {cp.mode}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {(project.status === 'draft' || project.status === 'paused') && (
            <button type="button" className="btn-primary" onClick={start}>Start worker</button>
          )}
          {live && <button type="button" className="btn-danger" onClick={stop}>Stop</button>}
          {project.status !== 'completed' && (
            <button type="button" className="btn-secondary" onClick={() => api.projects.complete(id).then(load)}>
              Mark complete
            </button>
          )}
          <DeleteButton onConfirm={removeProject} deleting={deleting} />
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

      {(project.stop_reason || project.last_error) && (
        <div className="card p-5 border border-red-200 bg-red-50 space-y-2">
          <div className="font-semibold text-danger text-lg flex items-center gap-2">
            <IconAlert width={18} height={18} />
            Why it stopped: {stopLabel(project.stop_reason) || 'Error'}
          </div>
          <p className="text-sm text-danger/90 whitespace-pre-wrap">
            {project.last_error || cp.detail || 'No error text stored'}
          </p>
          <div className="text-xs text-muted">
            reason code: <span className="font-mono">{project.stop_reason || '—'}</span>
            {' · '}iteration {project.agent_iteration ?? 0}
          </div>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => navigator.clipboard?.writeText(project.last_error || '')}
          >
            Copy full error
          </button>
        </div>
      )}

      <div className="card p-5 space-y-5 border border-line">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-lg">Progress command center</h2>
            <p className="text-xs text-muted mt-0.5">
              Continuous loop until token budget / rate limit / Stop
              {live ? ' · polling 1.5s' : ''}
              {cp.stage_at ? ` · live update ${new Date(cp.stage_at).toLocaleString()}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="badge bg-slate-100">Iter #{project.agent_iteration ?? cp.cycle ?? 0}</span>
            {cp.mode && <span className="badge bg-violet-50 text-violet-700">{cp.mode}</span>}
            {cp.status && <span className="badge bg-slate-100 font-mono">agent: {cp.status}</span>}
          </div>
        </div>

        {/* Connected pipeline stepper */}
        <div className="flex items-center overflow-x-auto pb-1">
          {displayPipeline.map((s, idx) => {
            const current = s.id === activeStage || (activeStage === 'waiting_retry' && s.id === 'planning');
            const done =
              activeIdx >= 0 &&
              pipelineIndex(s.id) < activeIdx &&
              !['error', 'blocked', 'waiting_retry'].includes(activeStage);
            const last = idx === displayPipeline.length - 1;
            return (
              <div key={s.id} className={`flex items-center ${last ? '' : 'flex-1 min-w-[7rem]'}`}>
                <button
                  type="button"
                  onClick={() => setStageFilter(s.id)}
                  className="flex items-center gap-2 shrink-0 group"
                  title={`Filter timeline to ${s.label}`}
                >
                  <span
                    className={`flex items-center justify-center h-7 w-7 rounded-full border-2 text-[11px] font-semibold shrink-0 ${
                      current
                        ? 'border-primary bg-blue-50 text-primary'
                        : done
                          ? 'border-success bg-emerald-50 text-success'
                          : 'border-line bg-white text-muted'
                    }`}
                  >
                    {done ? <IconCheck width={13} height={13} /> : current && live ? <IconLoader width={13} height={13} /> : idx + 1}
                  </span>
                  <span
                    className={`text-xs whitespace-nowrap ${
                      current ? 'text-primary font-semibold' : done ? 'text-success font-medium' : 'text-muted'
                    } group-hover:underline`}
                  >
                    {s.label}
                  </span>
                </button>
                {!last && (
                  <div className={`flex-1 h-0.5 mx-2 min-w-[1rem] ${done ? 'bg-success' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
          {(['error', 'blocked', 'done', 'waiting_retry', 'idle', 'queued'].includes(activeStage)) && (
            <div
              className={`ml-3 rounded-lg px-3 py-1.5 text-xs border shrink-0 font-semibold ${
                activeStage === 'done'
                  ? 'border-emerald-200 bg-emerald-50 text-success'
                  : activeStage === 'idle' || activeStage === 'queued'
                    ? 'border-line bg-slate-50'
                    : 'border-red-200 bg-red-50 text-danger'
              }`}
            >
              {stageLabel(activeStage)}
            </div>
          )}
        </div>

        {/* Parallel sub-agent view for the current cycle */}
        {!!subCards.length && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted mb-2">
              <IconUsers width={13} height={13} />
              Sub-agents this cycle
            </div>
            <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {subCards.map((e) => (
                <SubAgentCard key={e.id} e={e} />
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl bg-slate-50 border border-line p-3 text-sm space-y-2">
          {MEMORY_ROWS.map(({ key, icon: Icon, label }, i) => {
            if (key === 'now') {
              return (
                <div key={key} className={i ? 'border-t border-line pt-2' : ''}>
                  <span className="text-xs text-muted inline-flex items-center gap-1.5">
                    <Icon width={12} height={12} />
                    {label}
                  </span>
                  <p className="mt-0.5 whitespace-pre-wrap font-medium">{cp.detail || events[0]?.summary || 'Waiting for worker…'}</p>
                </div>
              );
            }
            if (key === 'idea_backlog') {
              if (!cp.memory?.idea_backlog?.length) return null;
              return (
                <div key={key} className="border-t border-line pt-2">
                  <span className="text-xs text-muted inline-flex items-center gap-1.5">
                    <Icon width={12} height={12} />
                    {label}
                  </span>
                  <ul className="mt-1 list-disc pl-4 text-muted">
                    {cp.memory.idea_backlog.slice(-6).map((idea, ii) => (
                      <li key={ii}>{idea}</li>
                    ))}
                  </ul>
                </div>
              );
            }
            const value = key === 'last_critique' ? cp.memory?.last_critique : cp[key];
            if (!value) return null;
            return (
              <div key={key} className="border-t border-line pt-2">
                <span className="text-xs text-muted inline-flex items-center gap-1.5">
                  <Icon width={12} height={12} />
                  {label}
                </span>
                <p className="mt-0.5 whitespace-pre-wrap text-muted">{value}</p>
              </div>
            );
          })}
          <div className="border-t border-line pt-2 grid sm:grid-cols-3 gap-2 text-xs text-muted">
            <div>Model: {cp.main_model || '—'}</div>
            <div>
              Subs:{' '}
              {cp.sub_ok != null
                ? `${cp.sub_ok} ok / ${cp.sub_fail || 0} fail`
                : cp.subtask_count != null
                  ? `${cp.subtask_count} queued`
                  : '—'}
            </div>
            <div>
              Tokens {project.tokens_used}/{project.token_budget}
            </div>
            {project.claimed_by && (
              <div className="sm:col-span-3 font-mono truncate">Claimed: {project.claimed_by}</div>
            )}
          </div>
        </div>

        {!!diagnostics.length && (
          <div className="space-y-2">
            {diagnostics.map((d, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-xs whitespace-pre-wrap flex items-start gap-2 ${
                  d.level === 'error'
                    ? 'bg-red-50 text-danger border border-red-100'
                    : d.level === 'warn'
                      ? 'bg-amber-50 text-amber-900 border border-amber-100'
                      : 'bg-slate-50 text-muted border border-line'
                }`}
              >
                {d.level === 'error' && <IconAlert width={13} height={13} className="mt-0.5 shrink-0" />}
                <span>{d.text}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-line pt-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">Full event timeline ({filteredEvents.length}/{events.length})</h3>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative">
                <IconSearch width={13} height={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  className="input pl-7 text-xs py-1 w-40"
                  placeholder="Search events…"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                />
              </div>
              <select
                className="input text-xs py-1"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
              >
                <option value="all">All stages</option>
                {PIPELINE.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              {(stageFilter !== 'all' || eventSearch) && (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => {
                    setStageFilter('all');
                    setEventSearch('');
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {eventGroups.map((group) => {
              const collapsed = collapsedCycles.has(group.id);
              return (
                <div key={group.id} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleCycle(group.id)}
                    className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted bg-slate-50 rounded-lg px-2.5 py-1.5 hover:bg-slate-100"
                  >
                    <span>Cycle {group.cycle} · {group.items.length} event{group.items.length === 1 ? '' : 's'}</span>
                    <span className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}>›</span>
                  </button>
                  {!collapsed &&
                    group.items.map((e) => {
                      const open = expandedEvent === e.id;
                      const isErr = e.status === 'error' || e.error_full;
                      const tone = stageTone(isErr ? 'error' : e.stage);
                      const tc = toneClasses(tone);
                      return (
                        <div
                          key={e.id}
                          className={`rounded-lg border-l-4 border border-line bg-white text-xs pl-2.5 py-2 pr-3 ${tc.borderL}`}
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => setExpandedEvent(open ? null : e.id)}
                          >
                            <div className="flex flex-wrap gap-x-2 gap-y-1 items-baseline">
                              <span className="font-mono text-muted">
                                #{e.cycle}.{e.seq}
                              </span>
                              <span className="font-semibold">{stageLabel(e.stage)}</span>
                              <span className="text-muted">{e.action || e.status}</span>
                              {e.model && <span className="font-mono text-[10px] text-muted">{e.model}</span>}
                              {e.role && <span className="badge bg-slate-100">{e.role}</span>}
                              <span className="text-muted ml-auto">
                                {new Date(e.created_at).toLocaleString()}
                                {e.duration_ms != null ? ` · ${e.duration_ms}ms` : ''}
                                {e.tokens_used ? ` · ${e.tokens_used} tok` : ''}
                              </span>
                            </div>
                            <p className={`mt-1 ${open ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                              {e.summary || e.detail || '(no summary)'}
                            </p>
                          </button>
                          {open && (
                            <div className="mt-2 space-y-2 border-t border-line pt-2">
                              {e.detail && (
                                <div>
                                  <div className="text-[10px] uppercase text-muted mb-0.5">Detail</div>
                                  <pre className="whitespace-pre-wrap break-words text-[11px] bg-slate-50 p-2 rounded max-h-64 overflow-y-auto">
                                    {e.detail}
                                  </pre>
                                </div>
                              )}
                              {e.error_full && (
                                <div>
                                  <div className="text-[10px] uppercase text-danger mb-0.5">Full error</div>
                                  <pre className="whitespace-pre-wrap break-words text-[11px] bg-red-100/50 p-2 rounded max-h-80 overflow-y-auto text-danger">
                                    {e.error_full}
                                  </pre>
                                  <button
                                    type="button"
                                    className="btn-ghost text-[10px] mt-1"
                                    onClick={() => navigator.clipboard?.writeText(e.error_full)}
                                  >
                                    Copy error
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
            {!filteredEvents.length && (
              <p className="text-xs text-muted">
                {events.length
                  ? 'No events match this filter/search.'
                  : 'No events yet. Start the project and keep Worker running — every planning / sub-agent / synthesis / review / save step lands here.'}
              </p>
            )}
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

      {/* Output pipeline: agent chat/output → pending approval → shared docs */}
      <div className="flex items-center gap-2 text-xs text-muted px-1 flex-wrap">
        <span className="inline-flex items-center gap-1 font-medium text-ink"><IconMessage width={13} height={13} /> Agent output</span>
        <IconArrowRight width={12} height={12} />
        <span className="inline-flex items-center gap-1 font-medium text-ink">Pending approval</span>
        <IconArrowRight width={12} height={12} />
        <span className="inline-flex items-center gap-1 font-medium text-ink">Shared docs</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5 flex flex-col min-h-[420px] min-w-0">
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

        <div className="space-y-4 min-w-0">
          <div className="card p-5 min-w-0">
            <h2 className="font-semibold mb-1">Pending approval (hidden staging)</h2>
            <p className="text-xs text-muted mb-3">Agent outputs stay here until you approve → Shared docs.</p>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {stagedDocuments.map((d) => (
                <div key={d.id} className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2">
                  <div className="text-sm font-medium">{d.title}</div>
                  <div className="text-xs text-muted mt-0.5 line-clamp-2">{d.description}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      className="btn-primary text-xs py-1 inline-flex items-center gap-1"
                      onClick={() => approveDoc(d.id)}
                    >
                      <IconCheck width={12} height={12} /> Approve
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs py-1 text-danger inline-flex items-center gap-1"
                      onClick={() => rejectDoc(d.id)}
                    >
                      <IconX width={12} height={12} /> Reject
                    </button>
                    <a className="btn-ghost text-xs py-1" href={`/api/documents/${d.id}/download`}>Preview</a>
                    <a className="btn-ghost text-xs py-1" href={`/api/documents/${d.id}/export/docx`} download>Export Word</a>
                  </div>
                </div>
              ))}
              {!stagedDocuments.length && <p className="text-sm text-muted">No staged outputs yet</p>}
            </div>
          </div>

          <div className="card p-5 min-w-0">
            <h2 className="font-semibold mb-3">Approved on this project</h2>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {documents.map((d) => (
                <div key={d.id} className="rounded-lg border border-line px-3 py-2 hover:bg-slate-50 text-sm">
                  <a href={`/api/documents/${d.id}/download`} className="block">
                    <div className="font-medium truncate">{d.title}</div>
                    <div className="text-xs text-muted">Shared doc ID = title</div>
                  </a>
                  <a
                    className="text-xs text-primary font-medium hover:underline"
                    href={`/api/documents/${d.id}/export/docx`}
                    download
                  >
                    Export Word
                  </a>
                </div>
              ))}
              {!documents.length && <p className="text-sm text-muted">Approve staged docs to publish here + Shared docs</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h2 className="font-semibold">Context uploads</h2>
            <input type="file" multiple className="text-xs max-w-full" onChange={onUpload} disabled={live} />
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

        <div className="card p-5 min-w-0">
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
