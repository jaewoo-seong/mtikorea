import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  IconCheck,
  IconX,
  IconMessage,
  IconClock,
  IconFile,
} from '../lib/icons';

function statusStyle(status) {
  if (status === 'done') return 'bg-emerald-100 text-success';
  if (status === 'in_progress') return 'bg-blue-100 text-primary';
  if (status === 'cancelled') return 'bg-slate-100 text-muted';
  return 'bg-amber-50 text-amber-800';
}

const COLUMNS = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
];

function formatDue(dueAt) {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [view, setView] = useState('board');
  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '');
  const [clientId, setClientId] = useState(searchParams.get('clientId') || '');
  const [form, setForm] = useState({
    title: '',
    description: '',
    clientId: searchParams.get('clientId') || '',
    projectId: searchParams.get('projectId') || '',
    documentId: '',
    assigneeId: '',
    dueAt: '',
    feedbackRequested: true,
  });
  const [msg, setMsg] = useState('');

  // Drawer / task detail state
  const [selectedId, setSelectedId] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [drawerBusy, setDrawerBusy] = useState(false);

  const selectedTask = tasks.find((t) => t.id === selectedId) || null;

  async function load() {
    const [t, c, p, d, u] = await Promise.all([
      api.tasks.list({
        projectId: projectId || undefined,
        clientId: clientId || undefined,
      }),
      api.clients.list(),
      api.projects.list(),
      api.documents.list({ visibility: 'shared' }),
      api.users.list(),
    ]);
    setTasks(t.tasks);
    setClients(c.clients);
    setProjects(p.projects);
    setDocuments(d.documents);
    setUsers(u.users);
  }

  useEffect(() => {
    api.me().then((r) => setMe(r.user)).catch(() => {});
  }, []);

  useEffect(() => {
    const next = {};
    if (clientId) next.clientId = clientId;
    if (projectId) next.projectId = projectId;
    setSearchParams(next, { replace: true });
    load().catch((e) => setMsg(e.message));
  }, [clientId, projectId]);

  async function loadComments(taskId) {
    setCommentsLoading(true);
    try {
      const r = await api.tasks.comments.list(taskId);
      setComments(r.comments);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setCommentsLoading(false);
    }
  }

  function openTask(task) {
    setSelectedId(task.id);
    setShowRejectBox(false);
    setRejectNote('');
    setCommentText('');
    loadComments(task.id);
  }

  function closeDrawer() {
    setSelectedId(null);
    setComments([]);
    setShowRejectBox(false);
    setRejectNote('');
  }

  async function create(e) {
    e.preventDefault();
    await api.tasks.create({
      title: form.title,
      description: form.description,
      clientId: form.clientId || null,
      projectId: form.projectId || null,
      documentId: form.documentId || null,
      assigneeId: form.assigneeId || null,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      feedbackRequested: form.feedbackRequested,
    });
    setForm({
      title: '',
      description: '',
      clientId: clientId || '',
      projectId: projectId || '',
      documentId: '',
      assigneeId: '',
      dueAt: '',
      feedbackRequested: true,
    });
    setMsg('Feedback request sent');
    await load();
  }

  async function patch(id, body) {
    await api.tasks.update(id, body);
    await load();
  }

  async function sendComment(e) {
    e.preventDefault();
    if (!selectedId || !commentText.trim()) return;
    const text = commentText.trim();
    setCommentText('');
    try {
      await api.tasks.comments.add(selectedId, text);
      await loadComments(selectedId);
    } catch (e2) {
      setMsg(e2.message);
    }
  }

  async function approveTask() {
    if (!selectedId) return;
    setDrawerBusy(true);
    try {
      await api.tasks.approve(selectedId);
      await load();
      await loadComments(selectedId);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setDrawerBusy(false);
    }
  }

  async function rejectTask(e) {
    e.preventDefault();
    if (!selectedId) return;
    setDrawerBusy(true);
    try {
      await api.tasks.reject(selectedId, rejectNote.trim());
      setShowRejectBox(false);
      setRejectNote('');
      await load();
      await loadComments(selectedId);
    } catch (e2) {
      setMsg(e2.message);
    } finally {
      setDrawerBusy(false);
    }
  }

  const canReview =
    selectedTask &&
    selectedTask.feedback_requested &&
    selectedTask.status !== 'done' &&
    selectedTask.status !== 'cancelled';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted mt-1">
            Internal feedback loops — assign a teammate, attach a shared document, request review.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-line overflow-hidden shrink-0">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm ${view === 'board' ? 'bg-primary text-white' : 'bg-surface text-muted hover:text-ink'}`}
            onClick={() => setView('board')}
          >
            Board
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm ${view === 'list' ? 'bg-primary text-white' : 'bg-surface text-muted hover:text-ink'}`}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

      <div className="card p-4 grid md:grid-cols-3 gap-3">
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" className="btn-secondary" onClick={() => { setClientId(''); setProjectId(''); }}>
          Clear filters
        </button>
      </div>

      <form onSubmit={create} className="card p-5 grid md:grid-cols-2 gap-3">
        <input className="input md:col-span-2" required placeholder="Ask for feedback…" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="input md:col-span-2 min-h-[70px]" placeholder="Context / what to review"
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <select className="input" value={form.assigneeId}
          onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
          <option value="">Assign internal user…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name || u.email}</option>
          ))}
        </select>
        <select className="input" value={form.documentId}
          onChange={(e) => setForm({ ...form, documentId: e.target.value })}>
          <option value="">Attach shared document…</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
        <select className="input" value={form.projectId}
          onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
          <option value="">Link project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <select className="input" value={form.clientId}
          onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
          <option value="">Link client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="input" type="datetime-local" value={form.dueAt}
          onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={form.feedbackRequested}
            onChange={(e) => setForm({ ...form, feedbackRequested: e.target.checked })} />
          Mark as feedback request
        </label>
        <button className="btn-primary md:col-span-2" type="submit">Send to teammate</button>
      </form>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      {view === 'board' ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="font-semibold text-sm">{col.label}</h2>
                  <span className="badge bg-slate-100 text-muted">{colTasks.length}</span>
                </div>
                <div className="space-y-3 min-h-[80px]">
                  {colTasks.map((t) => (
                    <article
                      key={t.id}
                      className="card p-3 border border-line flex flex-col gap-2 cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => openTask(t)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-sm leading-snug">{t.title}</h3>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {t.feedback_requested && (
                          <span className="badge bg-violet-50 text-violet-700 inline-flex items-center gap-1">
                            <IconMessage width={10} height={10} /> Feedback
                          </span>
                        )}
                        {t.assignee_name && <span className="badge bg-slate-100">→ {t.assignee_name}</span>}
                        {t.due_at && (
                          <span className="badge bg-slate-100 inline-flex items-center gap-1">
                            <IconClock width={10} height={10} /> {formatDue(t.due_at)}
                          </span>
                        )}
                      </div>
                      <select
                        className="input text-xs mt-1"
                        value={t.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => patch(t.id, { status: e.target.value })}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </article>
                  ))}
                  {!colTasks.length && (
                    <div className="text-xs text-muted text-center py-4 border border-dashed border-line rounded-lg">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tasks.map((t) => (
            <article
              key={t.id}
              className="card p-5 border border-line flex flex-col gap-3 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openTask(t)}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold leading-snug">{t.title}</h2>
                <span className={`badge capitalize shrink-0 ${statusStyle(t.status)}`}>{t.status.replace('_', ' ')}</span>
              </div>
              <p className="text-sm text-muted line-clamp-3">{t.description || 'No description'}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {t.feedback_requested && <span className="badge bg-violet-50 text-violet-700">Feedback</span>}
                {t.assignee_name && <span className="badge bg-slate-100">→ {t.assignee_name}</span>}
                {t.document_title && (
                  <a
                    className="badge bg-blue-50 text-primary hover:underline"
                    href={`/api/documents/${t.document_id}/download`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    📎 {t.document_title}
                  </a>
                )}
                {t.project_id && (
                  <Link
                    to={`/projects/${t.project_id}`}
                    className="badge bg-blue-50 text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t.project_title || 'Project'}
                  </Link>
                )}
                {t.client_id && (
                  <Link
                    to={`/clients/${t.client_id}`}
                    className="badge bg-emerald-50 text-success hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t.client_name}
                  </Link>
                )}
              </div>
              <select
                className="input text-xs mt-auto"
                value={t.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => patch(t.id, { status: e.target.value })}
              >
                <option value="open">open</option>
                <option value="in_progress">in_progress</option>
                <option value="done">done</option>
                <option value="cancelled">cancelled</option>
              </select>
            </article>
          ))}
        </div>
      )}
      {!tasks.length && (
        <div className="card p-10 text-center text-sm text-muted">No tasks for these filters</div>
      )}

      {/* Slide-in drawer */}
      {selectedTask && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-ink/30" onClick={closeDrawer} />
          <div className="relative w-full max-w-md bg-surface h-full shadow-xl border-l border-line flex flex-col">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-line">
              <div>
                <h2 className="font-semibold text-lg leading-snug">{selectedTask.title}</h2>
                <span className={`badge capitalize mt-2 inline-block ${statusStyle(selectedTask.status)}`}>
                  {selectedTask.status.replace('_', ' ')}
                </span>
              </div>
              <button type="button" className="btn-ghost p-1.5 shrink-0" onClick={closeDrawer}>
                <IconX width={16} height={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-sm text-ink whitespace-pre-wrap">
                {selectedTask.description || 'No description'}
              </p>

              <div className="flex flex-wrap gap-1.5 text-xs">
                {selectedTask.feedback_requested && (
                  <span className="badge bg-violet-50 text-violet-700 inline-flex items-center gap-1">
                    <IconMessage width={10} height={10} /> Feedback requested
                  </span>
                )}
                {selectedTask.assignee_name && (
                  <span className="badge bg-slate-100">→ {selectedTask.assignee_name}</span>
                )}
                {selectedTask.due_at && (
                  <span className="badge bg-slate-100 inline-flex items-center gap-1">
                    <IconClock width={10} height={10} /> Due {formatDue(selectedTask.due_at)}
                  </span>
                )}
                {selectedTask.document_title && (
                  <a
                    className="badge bg-blue-50 text-primary hover:underline inline-flex items-center gap-1"
                    href={`/api/documents/${selectedTask.document_id}/download`}
                  >
                    <IconFile width={10} height={10} /> {selectedTask.document_title}
                  </a>
                )}
                {selectedTask.project_id && (
                  <Link to={`/projects/${selectedTask.project_id}`} className="badge bg-blue-50 text-primary hover:underline">
                    {selectedTask.project_title || 'Project'}
                  </Link>
                )}
                {selectedTask.client_id && (
                  <Link to={`/clients/${selectedTask.client_id}`} className="badge bg-emerald-50 text-success hover:underline">
                    {selectedTask.client_name}
                  </Link>
                )}
              </div>

              <select
                className="input text-sm"
                value={selectedTask.status}
                onChange={(e) => patch(selectedTask.id, { status: e.target.value })}
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>

              {canReview && (
                <div className="card p-3 bg-amber-50/60 border border-amber-200 space-y-2">
                  <p className="text-xs font-medium text-amber-900">This task is awaiting review.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5 text-sm"
                      disabled={drawerBusy}
                      onClick={approveTask}
                    >
                      <IconCheck width={14} height={14} /> Approve
                    </button>
                    <button
                      type="button"
                      className="btn-danger flex-1 inline-flex items-center justify-center gap-1.5 text-sm"
                      disabled={drawerBusy}
                      onClick={() => setShowRejectBox((v) => !v)}
                    >
                      <IconX width={14} height={14} /> Reject
                    </button>
                  </div>
                  {showRejectBox && (
                    <form onSubmit={rejectTask} className="space-y-2">
                      <textarea
                        className="input text-sm min-h-[60px]"
                        placeholder="What needs to change?"
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                      />
                      <button type="submit" className="btn-secondary text-sm w-full" disabled={drawerBusy}>
                        Send rejection
                      </button>
                    </form>
                  )}
                </div>
              )}

              <div className="border-t border-line pt-3">
                <h3 className="font-semibold text-sm mb-3 inline-flex items-center gap-1.5">
                  <IconMessage width={13} height={13} /> Comments
                </h3>
                <div className="space-y-3 max-h-[280px] overflow-y-auto mb-3">
                  {commentsLoading && <p className="text-xs text-muted">Loading…</p>}
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                        c.author_id === me?.id ? 'bg-blue-50 text-ink ml-8' : 'bg-slate-50 text-ink mr-8'
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wide text-muted mb-1">
                        {c.author_name || 'Unknown'} · {new Date(c.created_at).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                      {c.body}
                    </div>
                  ))}
                  {!commentsLoading && !comments.length && (
                    <p className="text-sm text-muted">No comments yet. Start the thread below.</p>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={sendComment} className="flex gap-2 border-t border-line p-4 shrink-0">
              <input
                className="input"
                placeholder="Write a comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button className="btn-primary shrink-0" type="submit">Send</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
