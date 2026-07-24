import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import DocumentPreview from '../components/DocumentPreview';
import ConfirmButton from '../components/ConfirmButton';
import {
  PIPELINE,
  buildDiagnostics,
  checkpointOf,
  formatBudgetMinutes,
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

const TABS = ['live', 'outputs', 'brief', 'audit'];
const TAB_LABEL = { live: 'Live', outputs: 'Outputs', brief: 'Brief', audit: 'Audit' };
const MAIN_STAGES = ['planning', 'synthesis', 'review'];

/** Split kickoff_plan by **Agenda:** / **Sub-agent** / **Next focus:** headers when present. */
export function parseKickoffPlan(text) {
  const raw = text || '';
  if (!raw.trim()) return { agenda: null, subtasks: null, nextFocus: null, raw };

  const agendaMatch = raw.match(/\*\*Agenda:\*\*\s*([\s\S]*?)(?=\*\*(?:Sub-agent|Next focus:)|$)/i);
  const subMatch = raw.match(/\*\*Sub-agent[^*]*\*\*\s*([\s\S]*?)(?=\*\*Next focus:|$)/i);
  const nextMatch = raw.match(/\*\*Next focus:\*\*\s*([\s\S]*?)$/i);

  const agenda = agendaMatch?.[1]?.trim() || null;
  const subtasks = subMatch?.[1]?.trim() || null;
  const nextFocus = nextMatch?.[1]?.trim() || null;

  if (!agenda && !subtasks && !nextFocus) {
    return { agenda: null, subtasks: null, nextFocus: null, raw };
  }
  return { agenda, subtasks, nextFocus, raw };
}

function computeDefaultTab(project, stagedDocuments = []) {
  if (project.status === 'draft') return 'brief';
  if (project.stop_reason || project.last_error) return 'audit';
  if (stagedDocuments.length > 0 && project.status !== 'running') return 'outputs';
  if (project.status === 'running' || project.status === 'paused') return 'live';
  return 'brief';
}

function timeLeftLabel(project) {
  if (project.time_budget_minutes == null) return null;
  const usedPct = Number(project.timePct) || 0;
  const remainingMin = Math.max(
    0,
    Math.round(((100 - usedPct) / 100) * project.time_budget_minutes)
  );
  return `${formatBudgetMinutes(remainingMin)} left`;
}

function ProgressBar({ value, live, compact }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  if (compact) {
    return (
      <div className="flex items-center gap-2 min-w-[100px] flex-1 max-w-[180px]">
        <div className="flex-1 h-1.5 bg-neutral-200 overflow-hidden">
          <div
            className={`h-full transition-all duration-700 ${live ? 'bg-primary animate-pulse' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] font-mono text-muted shrink-0">{pct}%</span>
      </div>
    );
  }
  return (
    <div>
      <div className="flex justify-between text-xs text-muted mb-1.5">
        <span className="font-medium text-ink">{live ? 'Live progress' : 'Progress'}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-2 bg-neutral-200 overflow-hidden">
        <div
          className={`h-full transition-all duration-700 ${live ? 'bg-primary animate-pulse' : 'bg-primary'}`}
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
        <button type="button" className="btn-danger text-xs" disabled={deleting} onClick={onConfirm}>
          {deleting ? 'Deleting…' : 'Confirm delete'}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setArmed(false)}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="btn-ghost text-danger text-xs" onClick={() => setArmed(true)}>
      Delete
    </button>
  );
}

/** One mini-card per sub-agent role currently running in this cycle's sub_agents stage. */
function subAgentCards(events, cycle) {
  const byRole = new Map();
  for (const e of events) {
    if (e.stage !== 'sub_agents' || !e.role || e.cycle !== cycle) continue;
    if (!byRole.has(e.role)) byRole.set(e.role, e);
  }
  return [...byRole.values()];
}

function latestMainStageEvents(events, cycle) {
  const out = {};
  for (const e of events) {
    if (e.cycle !== cycle || !MAIN_STAGES.includes(e.stage)) continue;
    if (!out[e.stage]) out[e.stage] = e;
  }
  return out;
}

function SubAgentCard({ e }) {
  const [open, setOpen] = useState(false);
  const isRotate = e.action === 'auth_fail_rotate' || e.action === 'error_rotate';
  const isErr = e.status === 'error' || isRotate;
  const isOk = e.status === 'ok';
  const isRunning = e.status === 'started';
  const body = e.detail || e.error_full;
  const canExpand = !!body;

  return (
    <div
      className={`border px-3 py-2 text-xs ${
        isErr ? 'border-danger/40 bg-red-50' : isOk ? 'border-primary/30 bg-acc-100/50' : 'border-line'
      }`}
    >
      <button
        type="button"
        className={`w-full text-left ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={() => canExpand && setOpen((v) => !v)}
      >
        <div className="flex items-center gap-1.5 font-semibold">
          {isRunning && <IconLoader width={12} height={12} className="text-primary" />}
          {isOk && !isRotate && <IconCheck width={12} height={12} className="text-success" />}
          {isErr && <IconAlert width={12} height={12} className="text-danger" />}
          <span className="capitalize">{e.role || e.action?.replace(/_/g, ' ') || 'agent'}</span>
        </div>
        {e.model && <div className="font-mono text-[10px] text-muted mt-0.5 truncate">{e.model}</div>}
        <div className="text-muted mt-1">
          {isRotate
            ? e.action === 'auth_fail_rotate'
              ? 'Auth failure — rotating key'
              : 'Error — rotating model'
            : isRunning
              ? 'running…'
              : isOk
                ? `${e.tokens_used || 0} tok · ${e.duration_ms ?? '—'}ms`
                : 'failed'}
        </div>
        {canExpand && (
          <div className="text-[10px] text-primary mt-1">{open ? 'Hide detail ▲' : 'Show detail ▼'}</div>
        )}
      </button>
      {open && body && (
        <pre className="mt-2 whitespace-pre-wrap break-words text-[10px] bg-slate-50 p-2 rounded max-h-48 overflow-y-auto border border-line">
          {body}
        </pre>
      )}
    </div>
  );
}

const COMPACT_MEMORY_ROWS = [
  { key: 'next_focus', icon: IconArrowRight, label: 'Next focus' },
  { key: 'last_critique', icon: IconAlert, label: 'Last critique (rethink)' },
  { key: 'idea_backlog', icon: IconLightbulb, label: 'Idea backlog' },
];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [schedule, setSchedule] = useState({ timeBudgetMinutes: '', allottedHours: '', dueAt: '' });
  const toast = useToast();
  const [taskTitle, setTaskTitle] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('live');
  const autoTabProjectId = useRef(null);
  const [stageFilter, setStageFilter] = useState('all');
  const [eventSearch, setEventSearch] = useState('');
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [expandedMainStage, setExpandedMainStage] = useState(null);
  const [collapsedCycles, setCollapsedCycles] = useState(() => new Set());
  const [expandedDocIds, setExpandedDocIds] = useState(() => new Set());

  function toggleDocPreview(docId) {
    setExpandedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  async function load() {
    const d = await api.projects.get(id);
    setData(d);
    setSchedule({
      timeBudgetMinutes: d.project.time_budget_minutes ?? '',
      allottedHours: d.project.allotted_hours ?? '',
      dueAt: d.project.due_at ? new Date(d.project.due_at).toISOString().slice(0, 16) : '',
    });
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [id]);

  useEffect(() => {
    if (!data) return;
    if (autoTabProjectId.current !== id) {
      autoTabProjectId.current = id;
      setActiveTab(computeDefaultTab(data.project, data.stagedDocuments || []));
    }
  }, [id, data]);

  useEffect(() => {
    const running = data?.project?.status === 'running';
    const t = setInterval(() => load().catch(() => {}), running ? 1500 : 4000);
    return () => clearInterval(t);
  }, [id, data?.project?.status]);

  async function start() {
    try {
      await api.projects.start(id);
      toast.success('Worker looping until time budget / rate limit / Stop');
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function stop() {
    try {
      await api.projects.stop(id);
      toast.info('Paused');
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveSchedule(e) {
    e.preventDefault();
    try {
      await api.projects.update(id, {
        timeBudgetMinutes: schedule.timeBudgetMinutes === '' ? null : Number(schedule.timeBudgetMinutes),
      });
      toast.success('Time budget updated');
      await load();
    } catch (err) {
      toast.error(err.message);
    }
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
    setMsg('Document approved → appears in Documents');
    await load();
  }

  async function rejectDoc(docId) {
    await api.documents.reject(docId);
    setMsg('Document rejected — kept on this project, hidden from Documents');
    await load();
  }

  async function approveAllStaged() {
    try {
      const { approved } = await api.projects.approveAllStaged(id);
      toast.success(`Approved ${approved} document(s) → Documents library`);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function rejectAllStaged() {
    try {
      const { rejected } = await api.projects.rejectAllStaged(id);
      toast.success(`Rejected ${rejected} document(s) — kept on project, hidden from Documents`);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
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

  function filterStageAndGoAudit(stageId) {
    setStageFilter(stageId);
    setActiveTab('audit');
  }

  function toggleCycle(groupId) {
    setCollapsedCycles((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  if (!data) return <div className="text-sm text-muted">{msg || 'Loading…'}</div>;

  const {
    project,
    files,
    documents = [],
    stagedDocuments = [],
    rejectedDocuments = [],
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
  const mainStageEvents = latestMainStageEvents(events, currentCycle);
  const rotateEvents = events.filter(
    (e) =>
      e.cycle === currentCycle &&
      (e.action === 'auth_fail_rotate' || e.action === 'error_rotate')
  );
  const headerToneClasses = toneClasses(stageTone(activeStage));
  const kickoffParsed = parseKickoffPlan(project.kickoff_plan);
  const timeLeft = timeLeftLabel(project);

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
    const occurrence = cycleOccurrence.get(e.cycle) || 0;
    cycleOccurrence.set(e.cycle, occurrence + 1);
    eventGroups.push({ id: `${e.cycle}-${occurrence}`, cycle: e.cycle, items: [e] });
  }

  const documentsPanel = (
    <div className="card p-5 min-w-0 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-semibold">Documents</h2>
          <p className="text-xs text-muted mt-0.5">
            Only <strong>Approved</strong> appear in the main Documents library. Pending and Rejected stay on this project.
          </p>
        </div>
        <Link to={`/documents?projectId=${id}`} className="text-xs text-primary hover:underline shrink-0">
          Open in Documents →
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Pending approval <span className="font-mono normal-case">({stagedDocuments.length})</span>
          </h3>
          {stagedDocuments.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-primary text-xs py-1 inline-flex items-center gap-1"
                onClick={approveAllStaged}
              >
                <IconCheck width={12} height={12} /> Approve all
              </button>
              <ConfirmButton
                onConfirm={rejectAllStaged}
                className="btn-ghost text-xs py-1 text-danger inline-flex items-center gap-1"
              >
                <IconX width={12} height={12} /> Reject all
              </ConfirmButton>
            </div>
          )}
        </div>
        <div className="space-y-2 max-h-[22rem] overflow-y-auto">
          {stagedDocuments.map((d) => (
            <div key={d.id} className="border border-line bg-acc-100/40 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{d.title}</div>
                  <div className="text-xs text-muted mt-0.5 line-clamp-2">{d.description}</div>
                </div>
                <span className="badge-outline shrink-0">Pending</span>
              </div>
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
                <button
                  type="button"
                  className="btn-ghost text-xs py-1"
                  onClick={() => toggleDocPreview(d.id)}
                >
                  {expandedDocIds.has(d.id) ? 'Hide preview' : 'Preview'}
                </button>
                <a className="btn-ghost text-xs py-1" href={`/api/documents/${d.id}/export/docx`} download>
                  Export Word
                </a>
              </div>
              {expandedDocIds.has(d.id) && (
                <div className="pt-2 mt-2 border-t border-line">
                  <DocumentPreview documentId={d.id} />
                </div>
              )}
            </div>
          ))}
          {!stagedDocuments.length && (
            <p className="text-sm text-muted">No pending outputs — agent stages docs here for review</p>
          )}
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
          Approved <span className="font-mono normal-case">({documents.length})</span>
        </h3>
        <p className="text-[11px] text-muted mb-2">Also listed under Documents for the whole org.</p>
        <div className="space-y-2 max-h-[22rem] overflow-y-auto">
          {documents.map((d) => (
            <div key={d.id} className="border border-line px-3 py-2 hover:bg-black/[0.02] text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.title}</div>
                  <div className="text-xs text-muted">In Documents library</div>
                </div>
                <span className="badge-neutral shrink-0">Approved</span>
              </div>
              <div className="flex gap-3 mt-2 flex-wrap">
                <button
                  type="button"
                  className="text-xs text-primary font-medium hover:underline"
                  onClick={() => toggleDocPreview(d.id)}
                >
                  {expandedDocIds.has(d.id) ? 'Hide' : 'Preview'}
                </button>
                <a className="text-xs text-primary font-medium hover:underline" href={`/api/documents/${d.id}/download`}>
                  Download
                </a>
                <a
                  className="text-xs text-primary font-medium hover:underline"
                  href={`/api/documents/${d.id}/export/docx`}
                  download
                >
                  Export Word
                </a>
              </div>
              {expandedDocIds.has(d.id) && (
                <div className="pt-2 mt-2 border-t border-line">
                  <DocumentPreview documentId={d.id} />
                </div>
              )}
            </div>
          ))}
          {!documents.length && (
            <p className="text-sm text-muted">Approve pending docs to publish them here and in Documents</p>
          )}
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
          Rejected <span className="font-mono normal-case">({rejectedDocuments.length})</span>
        </h3>
        <p className="text-[11px] text-muted mb-2">
          Hidden from Documents. Still on this project — you can approve later if needed.
        </p>
        <div className="space-y-2 max-h-[18rem] overflow-y-auto">
          {rejectedDocuments.map((d) => (
            <div key={d.id} className="border border-line bg-neutral-100/50 px-3 py-2 text-sm opacity-90">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.title}</div>
                  <div className="text-xs text-muted line-clamp-2">{d.description}</div>
                </div>
                <span className="badge bg-red-50 text-danger shrink-0">Rejected</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  className="btn-primary text-xs py-1 inline-flex items-center gap-1"
                  onClick={() => approveDoc(d.id)}
                >
                  <IconCheck width={12} height={12} /> Approve anyway
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs py-1"
                  onClick={() => toggleDocPreview(d.id)}
                >
                  {expandedDocIds.has(d.id) ? 'Hide preview' : 'Preview'}
                </button>
                <a className="btn-ghost text-xs py-1" href={`/api/documents/${d.id}/download`}>
                  Download
                </a>
              </div>
              {expandedDocIds.has(d.id) && (
                <div className="pt-2 mt-2 border-t border-line">
                  <DocumentPreview documentId={d.id} />
                </div>
              )}
            </div>
          ))}
          {!rejectedDocuments.length && <p className="text-sm text-muted">No rejected documents</p>}
        </div>
      </div>
    </div>
  );

  const eventTimeline = (
    <div className="space-y-3">
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
        {eventGroups.map((group, idx) => {
          const defaultCollapsed = idx >= 3;
          const collapsed = collapsedCycles.has(group.id) ? !defaultCollapsed : defaultCollapsed;
          return (
            <div key={group.id} className="space-y-2">
              <button
                type="button"
                onClick={() => toggleCycle(group.id)}
                className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted border border-line px-2.5 py-1.5 hover:bg-black/[0.03]"
              >
                <span>
                  Cycle {group.cycle} · {group.items.length} event{group.items.length === 1 ? '' : 's'}
                </span>
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
                      className={`border-l-4 border border-line text-xs pl-2.5 py-2 pr-3 ${tc.borderL}`}
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
                          {e.role && <span className="badge-neutral">{e.role}</span>}
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
  );

  const nudgeDock = (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <div className="card p-4 flex flex-col min-h-[320px] max-h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Nudge</h2>
          {live && <span className="badge-accent animate-pulse text-[10px]">live</span>}
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto mb-3 min-h-0">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`border px-2.5 py-2 text-xs whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'border-primary/30 bg-acc-100/50 text-ink ml-4'
                  : m.role === 'error'
                    ? 'border-danger/30 bg-red-50 text-danger'
                    : 'border-line text-ink mr-4'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">{m.role}</div>
              {m.content}
              {m.document_id && (
                <div className="text-[10px] text-primary mt-1">Doc: {m.document_title || m.document_id}</div>
              )}
            </div>
          ))}
          {!messages.length && (
            <p className="text-xs text-muted">Chat with the agent. Background worker also posts responses + staged docs.</p>
          )}
        </div>
        <form onSubmit={sendChat} className="flex gap-2 border-t border-line pt-3 shrink-0">
          <input
            className="input text-sm"
            placeholder="Nudge the agent…"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button className="btn-primary shrink-0 text-sm" type="submit">
            Send
          </button>
        </form>
      </div>
    </aside>
  );

  return (
    <div className="space-y-4">
      {/* Sticky control strip */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-3 bg-[#f2f2f3] border-b border-line space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/projects" className="text-xs text-muted hover:text-primary shrink-0">
            ← Projects
          </Link>
          <h1 className="font-display text-xl font-semibold truncate min-w-0 flex-1">{project.title}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] shrink-0">
            <span className={`inline-flex items-center gap-1 font-semibold ${headerToneClasses.badge}`}>
              {live && <IconLoader width={11} height={11} />}
              {stageLabel(activeStage)}
            </span>
            <span className="badge-outline capitalize">{project.status}</span>
            {project.client_name && (
              <Link to={`/clients/${project.client_id}`} className="badge-neutral hover:underline hidden sm:inline-flex">
                {project.client_name}
              </Link>
            )}
            {project.overdue && (
              <span className="badge bg-red-50 text-danger inline-flex items-center gap-1">
                <IconAlert width={10} height={10} />
                Past due
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <ProgressBar value={project.progressPct ?? project.progress_pct} live={live} compact />
          <div className="flex items-center gap-3 text-[11px] text-muted shrink-0">
            {timeLeft && (
              <span className="inline-flex items-center gap-1">
                <IconClock width={11} height={11} />
                {timeLeft}
              </span>
            )}
            <span className="font-mono">
              {project.tokens_used}
              {project.token_budget != null ? `/${project.token_budget} tok` : ' tok'}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap items-center ml-auto">
            {(project.status === 'draft' || project.status === 'paused') && (
              <button type="button" className="btn-primary text-xs py-1.5" onClick={start}>
                Start
              </button>
            )}
            {live && (
              <button type="button" className="btn-danger text-xs py-1.5" onClick={stop}>
                Stop
              </button>
            )}
            {project.status !== 'completed' && (
              <button
                type="button"
                className="btn-secondary text-xs py-1.5"
                onClick={() => api.projects.complete(id).then(load)}
              >
                Complete
              </button>
            )}
            <DeleteButton onConfirm={removeProject} deleting={deleting} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="seg flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={`seg-opt ${activeTab === t ? 'seg-opt-active' : ''}`}
          >
            {TAB_LABEL[t]}
            {t === 'outputs' && stagedDocuments.length > 0 && (
              <span className="ml-1 font-mono">({stagedDocuments.length})</span>
            )}
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      {/* Main layout: tab content + nudge dock */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="min-w-0 space-y-4">
          {activeTab === 'live' && (
            <>
              {(project.stop_reason || project.last_error) && (
                <div className="card p-4 border border-red-200 bg-red-50 space-y-2">
                  <div className="font-semibold text-danger text-sm flex items-center gap-2">
                    <IconAlert width={16} height={16} />
                    Stopped: {stopLabel(project.stop_reason) || 'Error'}
                  </div>
                  <p className="text-xs text-danger/90 line-clamp-3">
                    {project.last_error || cp.detail || 'No error text stored'}
                  </p>
                  <button type="button" className="btn-ghost text-xs" onClick={() => setActiveTab('audit')}>
                    View full details in Audit →
                  </button>
                </div>
              )}

              <div className="card p-4 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-semibold">Pipeline</h2>
                    <p className="text-xs text-muted mt-0.5">
                      Continuous loop until time budget / rate limit / Stop
                      {live ? ' · polling 1.5s' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="badge-neutral">Cycle #{currentCycle}</span>
                    <span className="badge-neutral">Iter #{project.agent_iteration ?? cp.cycle ?? 0}</span>
                    {cp.mode && <span className="badge-accent2">{cp.mode}</span>}
                  </div>
                </div>

                <div className="flex items-center overflow-x-auto pb-1">
                  {displayPipeline.map((s, idx) => {
                    const current =
                      s.id === activeStage || (activeStage === 'waiting_retry' && s.id === 'planning');
                    const done =
                      activeIdx >= 0 &&
                      pipelineIndex(s.id) < activeIdx &&
                      !['error', 'blocked', 'waiting_retry'].includes(activeStage);
                    const last = idx === displayPipeline.length - 1;
                    return (
                      <div key={s.id} className={`flex items-center ${last ? '' : 'flex-1 min-w-[7rem]'}`}>
                        <button
                          type="button"
                          onClick={() => filterStageAndGoAudit(s.id)}
                          className="flex items-center gap-2 shrink-0 group"
                          title={`Filter timeline to ${s.label}`}
                        >
                          <span
                            className={`flex items-center justify-center h-7 w-7 rounded-full border-2 text-[11px] font-semibold shrink-0 ${
                              current
                                ? 'border-primary bg-acc-100 text-primary'
                                : done
                                  ? 'border-neutral-700 bg-neutral-100 text-neutral-800'
                                  : 'border-line text-muted'
                            }`}
                          >
                            {done ? (
                              <IconCheck width={13} height={13} />
                            ) : current && live ? (
                              <IconLoader width={13} height={13} />
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <span
                            className={`text-xs whitespace-nowrap ${
                              current ? 'text-primary font-semibold' : done ? 'text-neutral-800 font-medium' : 'text-muted'
                            } group-hover:underline`}
                          >
                            {s.label}
                          </span>
                        </button>
                        {!last && (
                          <div
                            className={`flex-1 h-0.5 mx-2 min-w-[1rem] ${done ? 'bg-neutral-700' : 'bg-neutral-200'}`}
                          />
                        )}
                      </div>
                    );
                  })}
                  {(['error', 'blocked', 'done', 'waiting_retry', 'idle', 'queued'].includes(activeStage)) && (
                    <div
                      className={`ml-3 px-3 py-1.5 text-xs border shrink-0 font-semibold ${
                        activeStage === 'done'
                          ? 'border-neutral-400 bg-neutral-100 text-neutral-800'
                          : activeStage === 'idle' || activeStage === 'queued'
                            ? 'border-line'
                            : 'border-danger/40 bg-red-50 text-danger'
                      }`}
                    >
                      {stageLabel(activeStage)}
                    </div>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  {/* Main agent panel */}
                  <div className="border border-line p-3 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Main agent</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted">Model</span>
                        <div className="font-mono mt-0.5">{cp.main_model || '—'}</div>
                      </div>
                      <div>
                        <span className="text-muted">Stage</span>
                        <div className="font-semibold mt-0.5">{stageLabel(activeStage)}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted inline-flex items-center gap-1">
                          <IconMessage width={11} height={11} /> Now
                        </span>
                        <p className="mt-0.5 text-sm whitespace-pre-wrap font-medium">
                          {cp.detail || events[0]?.summary || 'Waiting for worker…'}
                        </p>
                      </div>
                    </div>

                    {MAIN_STAGES.map((stage) => {
                      const e = mainStageEvents[stage];
                      if (!e) return null;
                      const open = expandedMainStage === stage;
                      return (
                        <div key={stage} className="border-t border-line pt-2">
                          <button
                            type="button"
                            className="w-full text-left text-xs"
                            onClick={() => setExpandedMainStage(open ? null : stage)}
                          >
                            <span className="font-semibold">{stageLabel(stage)}</span>
                            <span className="text-muted ml-2 font-mono">#{e.cycle}.{e.seq}</span>
                            <p className={`mt-0.5 text-muted ${open ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                              {e.summary || e.detail || '(no summary)'}
                            </p>
                          </button>
                          {open && (e.detail || e.error_full) && (
                            <pre className="mt-1 whitespace-pre-wrap break-words text-[10px] bg-slate-50 p-2 rounded max-h-40 overflow-y-auto">
                              {e.detail || e.error_full}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Sub-agents panel */}
                  <div className="border border-line p-3 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted inline-flex items-center gap-1.5">
                      <IconUsers width={12} height={12} />
                      Sub-agents
                    </h3>
                    {!!rotateEvents.length && (
                      <div className="space-y-2">
                        {rotateEvents.map((e) => (
                          <SubAgentCard key={e.id} e={e} />
                        ))}
                      </div>
                    )}
                    {!!subCards.length ? (
                      <div className="grid gap-2">
                        {subCards.map((e) => (
                          <SubAgentCard key={e.id} e={e} />
                        ))}
                      </div>
                    ) : (
                      !rotateEvents.length && (
                        <p className="text-xs text-muted">No sub-agents active this cycle</p>
                      )
                    )}
                  </div>
                </div>

                {/* Compact memory rows */}
                <div className="border border-line p-3 text-xs space-y-1.5">
                  {COMPACT_MEMORY_ROWS.map(({ key, icon: Icon, label }, i) => {
                    if (key === 'idea_backlog') {
                      if (!cp.memory?.idea_backlog?.length) return null;
                      return (
                        <div key={key} className={i ? 'border-t border-line pt-1.5' : ''}>
                          <span className="text-muted inline-flex items-center gap-1">
                            <Icon width={11} height={11} />
                            {label}
                          </span>
                          <ul className="mt-0.5 list-disc pl-4 text-muted">
                            {cp.memory.idea_backlog.slice(-4).map((idea, ii) => (
                              <li key={ii}>{idea}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    }
                    const value = key === 'last_critique' ? cp.memory?.last_critique : cp[key];
                    if (!value) return null;
                    return (
                      <div key={key} className={i ? 'border-t border-line pt-1.5' : ''}>
                        <span className="text-muted inline-flex items-center gap-1">
                          <Icon width={11} height={11} />
                          {label}
                        </span>
                        <p className="mt-0.5 whitespace-pre-wrap text-muted line-clamp-3">{value}</p>
                      </div>
                    );
                  })}
                  <div className="border-t border-line pt-1.5 grid sm:grid-cols-2 gap-1 text-[10px] text-muted">
                    <div>
                      Subs:{' '}
                      {cp.sub_ok != null
                        ? `${cp.sub_ok} ok / ${cp.sub_fail || 0} fail`
                        : cp.subtask_count != null
                          ? `${cp.subtask_count} queued`
                          : '—'}
                    </div>
                    {project.claimed_by && (
                      <div className="font-mono truncate sm:col-span-2">Claimed: {project.claimed_by}</div>
                    )}
                  </div>
                </div>

                {!!diagnostics.length && (
                  <div className="space-y-2">
                    {diagnostics.map((d, i) => (
                      <div
                        key={i}
                        className={`px-3 py-2 text-xs whitespace-pre-wrap flex items-start gap-2 border ${
                          d.level === 'error'
                            ? 'bg-red-50 text-danger border-danger/30'
                            : d.level === 'warn'
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'text-muted border-line'
                        }`}
                      >
                        {d.level === 'error' && <IconAlert width={13} height={13} className="mt-0.5 shrink-0" />}
                        <span>{d.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'outputs' && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted px-1 flex-wrap">
                <span className="inline-flex items-center gap-1 font-medium text-ink">
                  <IconMessage width={13} height={13} /> Agent output
                </span>
                <IconArrowRight width={12} height={12} />
                <span className="inline-flex items-center gap-1 font-medium text-ink">Pending approval</span>
                <IconArrowRight width={12} height={12} />
                <span className="inline-flex items-center gap-1 font-medium text-ink">Shared docs</span>
              </div>
              {documentsPanel}
            </>
          )}

          {activeTab === 'brief' && (
            <div className="space-y-4">
              <div className="card p-5 space-y-3">
                <h2 className="font-semibold">Project brief</h2>
                <div>
                  <div className="text-xs font-medium text-muted uppercase tracking-wide">Goal</div>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{project.goal || '—'}</p>
                </div>
                {project.desired_output && (
                  <div>
                    <div className="text-xs font-medium text-muted uppercase tracking-wide">Desired output</div>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{project.desired_output}</p>
                  </div>
                )}
              </div>

              {project.kickoff_plan ? (
                <div className="card p-5 space-y-3 border-l-4 border-l-accent2 bg-blue-50/40">
                  <h2 className="font-semibold flex items-center gap-2 text-accent2 text-sm">
                    <IconMessage width={16} height={16} /> Agent kickoff plan
                  </h2>
                  {kickoffParsed.agenda || kickoffParsed.subtasks || kickoffParsed.nextFocus ? (
                    <div className="space-y-3 text-sm">
                      {kickoffParsed.agenda && (
                        <div>
                          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Agenda</div>
                          <p className="whitespace-pre-wrap">{kickoffParsed.agenda}</p>
                        </div>
                      )}
                      {kickoffParsed.subtasks && (
                        <div>
                          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Sub-agents</div>
                          <p className="whitespace-pre-wrap">{kickoffParsed.subtasks}</p>
                        </div>
                      )}
                      {kickoffParsed.nextFocus && (
                        <div>
                          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Next focus</div>
                          <p className="whitespace-pre-wrap">{kickoffParsed.nextFocus}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap text-ink">{kickoffParsed.raw}</div>
                  )}
                </div>
              ) : (
                <div className="card p-5 border border-dashed border-line text-sm text-muted flex items-center gap-2">
                  {live || project.status === 'queued' ? (
                    <>
                      <IconLoader width={14} height={14} className="text-primary shrink-0" />
                      Waiting for first plan… Start the worker if this is still a draft.
                    </>
                  ) : (
                    <>Kickoff plan appears after the first planning cycle. Click Start to begin.</>
                  )}
                </div>
              )}

              <form onSubmit={saveSchedule} className="card p-5 grid md:grid-cols-3 gap-3 items-end">
                <label className="text-sm md:col-span-2">
                  <span className="text-muted text-xs">
                    Time budget (minutes, 5–720){' '}
                    {schedule.timeBudgetMinutes !== '' && (
                      <span className="text-ink font-medium">
                        — {formatBudgetMinutes(Number(schedule.timeBudgetMinutes))}
                      </span>
                    )}
                  </span>
                  <input
                    className="input mt-1"
                    type="number"
                    min="5"
                    max="720"
                    step="5"
                    value={schedule.timeBudgetMinutes}
                    onChange={(e) => setSchedule({ ...schedule, timeBudgetMinutes: e.target.value })}
                    disabled={live}
                  />
                  {(schedule.allottedHours !== '' || schedule.dueAt !== '') && (
                    <span className="text-[11px] text-muted mt-1 block">
                      Legacy: {schedule.allottedHours !== '' ? `${schedule.allottedHours}h allotted` : ''}
                      {schedule.allottedHours !== '' && schedule.dueAt !== '' ? ' · ' : ''}
                      {schedule.dueAt !== '' ? `due ${new Date(schedule.dueAt).toLocaleString()}` : ''}
                      {' '}— set a time budget above to switch this project to the current model.
                    </span>
                  )}
                </label>
                <button className="btn-secondary" type="submit" disabled={live}>
                  Save time budget
                </button>
              </form>

              <div className="card p-5 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                  <h2 className="font-semibold">Context uploads</h2>
                  <input type="file" multiple className="text-xs max-w-full" onChange={onUpload} disabled={live} />
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {files.map((f) => (
                    <a
                      key={f.id}
                      href={`/api/projects/${id}/files/${f.id}/download`}
                      className="flex justify-between gap-3 border border-line px-3 py-2 text-sm hover:bg-black/[0.02]"
                    >
                      <span className="truncate">{f.filename}</span>
                      <span className="text-xs text-muted">{Math.round((f.size_bytes || 0) / 1024)} KB</span>
                    </a>
                  ))}
                  {!files.length && <p className="text-sm text-muted">Upload briefing files before Start</p>}
                </div>
              </div>

              <div className="card p-5 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-semibold">Human tasks</h2>
                    <Link to={`/tasks?projectId=${id}`} className="text-xs text-primary hover:underline">
                      All tasks →
                    </Link>
                  </div>
                  <form onSubmit={addTask} className="flex gap-2 flex-1 min-w-[240px] max-w-md">
                    <input
                      className="input"
                      placeholder="Add follow-up task…"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                    />
                    <button className="btn-primary shrink-0" type="submit">
                      Add
                    </button>
                  </form>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {tasks.map((t) => (
                    <div key={t.id} className="border border-line p-3">
                      <div className="flex justify-between gap-2">
                        <div className="font-medium text-sm">{t.title}</div>
                        <span className="badge-outline text-xs">{t.status}</span>
                      </div>
                      <div className="text-xs text-muted mt-1">{t.assignee_name || 'Unassigned'}</div>
                    </div>
                  ))}
                  {!tasks.length && (
                    <p className="text-sm text-muted md:col-span-2">No human tasks yet — agent work is separate</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-4">
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

              <div className="card p-5">{eventTimeline}</div>

              <div className="card p-5 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Work log</h2>
                  {live && <span className="badge-accent animate-pulse">streaming</span>}
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {[...logs].reverse().slice(0, 40).map((l) => (
                    <div key={l.id} className="pl-3 border-l-2 border-primary/30">
                      <div className="text-[11px] text-muted font-mono">
                        #{l.step_number} · {l.action}
                      </div>
                      <div className="text-sm whitespace-pre-wrap line-clamp-4">{l.detail}</div>
                    </div>
                  ))}
                  {!logs.length && <p className="text-sm text-muted">No steps until Start</p>}
                </div>
                {!!results.length && (
                  <div className="mt-3 pt-3 border-t border-line text-xs text-muted">
                    {results.length} finding snapshots
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {nudgeDock}
      </div>
    </div>
  );
}
