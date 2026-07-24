import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { IconPlus, IconSearch, IconPaperclip, IconMessage, IconClock } from '../lib/icons';
import {
  INBOXES,
  KINDS,
  kindLabel,
  kindBadge,
  stateChip,
  priorityChip,
  dueState,
  relativeTime,
} from '../lib/taskMeta';
import { Avatar } from '../components/tasks/PeoplePicker';
import RequestComposer from '../components/tasks/RequestComposer';
import RequestDetail from '../components/tasks/RequestDetail';
import DocumentPreviewModal from '../components/DocumentPreviewModal';

/**
 * Internal request inbox.
 *
 * Replaces the old four-column kanban: approval states don't map onto board
 * columns, and the thing people actually need on opening this page is "what is
 * waiting on me", which a board can't express. Layout is rail / list / detail,
 * collapsing to list-then-overlay below xl.
 */
export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState({});
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const [inbox, setInbox] = useState(searchParams.get('inbox') || 'awaiting_me');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const [selectedId, setSelectedId] = useState(searchParams.get('task') || null);
  const [thread, setThread] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const selectedTask = tasks.find((t) => t.id === selectedId) || null;

  // --- data ---------------------------------------------------------------

  const loadTasks = useCallback(async () => {
    const [t, c] = await Promise.all([
      api.tasks.list({ inbox, kind: kind || undefined, q: q || undefined }),
      api.tasks.counts(),
    ]);
    setTasks(t.tasks);
    setCounts(c.counts || {});
  }, [inbox, kind, q]);

  useEffect(() => {
    Promise.all([
      api.me(),
      api.clients.list(),
      api.projects.list(),
      api.users.list(),
      api.documents.list(),
    ])
      .then(([m, c, p, u, d]) => {
        setMe(m.user);
        setClients(c.clients);
        setProjects(p.projects);
        setUsers(u.users);
        setDocuments(d.documents);
      })
      .catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    loadTasks()
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [loadTasks]);

  // Teammates act on these while you're looking at them, so keep the list warm.
  useEffect(() => {
    const t = setInterval(() => loadTasks().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [loadTasks]);

  useEffect(() => {
    const next = {};
    if (inbox !== 'awaiting_me') next.inbox = inbox;
    if (selectedId) next.task = selectedId;
    setSearchParams(next, { replace: true });
  }, [inbox, selectedId]);

  const loadThread = useCallback(async (taskId, { silent = false } = {}) => {
    if (!taskId) return;
    if (!silent) setThreadLoading(true);
    try {
      const r = await api.tasks.thread(taskId);
      setThread(r.items);
    } catch (e) {
      if (!silent) toast.error(e.message);
    } finally {
      if (!silent) setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setThread([]);
      return undefined;
    }
    loadThread(selectedId);
    const t = setInterval(() => loadThread(selectedId, { silent: true }), 5000);
    return () => clearInterval(t);
  }, [selectedId, loadThread]);

  // Esc closes the detail pane, matching the drawer behaviour elsewhere.
  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // --- actions ------------------------------------------------------------

  async function refreshOne(taskId) {
    const { task } = await api.tasks.get(taskId);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? task : t)));
  }

  async function guard(fn, successMsg) {
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
    } catch (e) {
      toast.error(e.message);
      throw e;
    }
  }

  async function createRequest(payload) {
    await guard(async () => {
      const { task } = await api.tasks.create(payload);
      setComposerOpen(false);
      // Land on the inbox that actually contains what was just raised — staying
      // on "Needs my approval" would show an empty list right after a success
      // toast, which reads as though nothing happened.
      setInbox('mine');
      setSelectedId(task.id);
      // setInbox is a no-op when we were already on "mine", so refetch directly
      // rather than relying on the filter effect firing.
      await loadTasks();
    }, 'Request sent');
  }

  async function decide(decision, note) {
    const labels = {
      approved: 'Approved',
      rejected: 'Rejected',
      changes_requested: 'Changes requested',
    };
    await guard(async () => {
      await api.tasks.decide(selectedId, decision, note);
      await Promise.all([refreshOne(selectedId), loadThread(selectedId, { silent: true }), loadTasks()]);
    }, labels[decision]);
  }

  async function comment(text) {
    await guard(async () => {
      await api.tasks.comments.add(selectedId, text);
      await Promise.all([loadThread(selectedId, { silent: true }), refreshOne(selectedId)]);
    });
  }

  async function addParticipants(userIds, role) {
    await guard(
      async () => {
        await api.tasks.participants.add(selectedId, userIds, role);
        await Promise.all([refreshOne(selectedId), loadThread(selectedId, { silent: true })]);
      },
      role === 'approver' ? 'Approver added' : 'Added to the thread'
    );
  }

  async function removeParticipant(userId) {
    await guard(async () => {
      await api.tasks.participants.remove(selectedId, userId);
      await Promise.all([refreshOne(selectedId), loadThread(selectedId, { silent: true })]);
    });
  }

  async function addAttachments(documentIds) {
    await guard(async () => {
      await api.tasks.attachments.add(selectedId, documentIds);
      await Promise.all([refreshOne(selectedId), loadThread(selectedId, { silent: true })]);
    }, 'Documents attached');
  }

  async function removeAttachment(documentId) {
    await guard(async () => {
      await api.tasks.attachments.remove(selectedId, documentId);
      await Promise.all([refreshOne(selectedId), loadThread(selectedId, { silent: true })]);
    });
  }

  async function reopen() {
    await guard(async () => {
      await api.tasks.update(selectedId, { status: 'open' });
      await Promise.all([refreshOne(selectedId), loadThread(selectedId, { silent: true }), loadTasks()]);
    }, 'Reopened');
  }

  // --- derived ------------------------------------------------------------

  const visible = useMemo(
    () => (showResolved ? tasks : tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')),
    [tasks, showResolved]
  );

  const resolvedHidden = tasks.length - visible.length;

  const detailProps = {
    task: selectedTask,
    thread,
    threadLoading,
    users,
    clients,
    documents,
    me,
    onClose: () => setSelectedId(null),
    onDecide: decide,
    onComment: comment,
    onAddParticipants: addParticipants,
    onRemoveParticipant: removeParticipant,
    onAddAttachments: addAttachments,
    onRemoveAttachment: removeAttachment,
    onReopen: reopen,
    onPreviewDocument: (id) => setPreviewDoc(documents.find((d) => d.id === id) || null),
  };

  return (
    // The page owns the viewport and never scrolls itself — each column scrolls
    // internally instead. Without this the conversation's message box ends up
    // below the fold, so replying means scrolling the whole page first.
    // 6.5rem = the app header (3.5rem) plus <main>'s p-6 top and bottom.
    <div className="flex flex-col gap-5 h-[calc(100vh-6.5rem)] min-h-[520px]">
      <div className="flex items-start justify-between gap-4 flex-wrap shrink-0">
        <div>
          <h1 className="text-3xl">Requests</h1>
          <p className="text-sm text-muted mt-1">
            Ask a teammate for an approval, an idea, or an answer — with the documents attached.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-2 shrink-0"
          onClick={() => setComposerOpen(true)}
        >
          <IconPlus width={15} height={15} /> New request
        </button>
      </div>

      <div className="grid xl:grid-cols-[190px_minmax(0,1fr)_minmax(0,460px)] lg:grid-cols-[190px_minmax(0,1fr)] gap-5 items-start flex-1 min-h-0">
        {/* --- Rail ------------------------------------------------- */}
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-y-auto lg:h-full shrink-0 pb-1 lg:pb-0">
          {INBOXES.map((box) => {
            const active = inbox === box.key;
            const n = counts[box.countKey] ?? 0;
            return (
              <button
                key={box.key}
                type="button"
                onClick={() => setInbox(box.key)}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-sm text-left border-l-2 shrink-0 whitespace-nowrap transition ${
                  active
                    ? 'border-primary text-primary font-medium bg-acc-100'
                    : 'border-transparent text-muted hover:text-ink hover:bg-black/[0.03]'
                }`}
              >
                {box.label}
                {n > 0 && (
                  <span
                    className={`text-xs tabular-nums px-1.5 ${
                      box.key === 'awaiting_me' && !active ? 'bg-primary text-canvas' : 'text-muted'
                    }`}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* --- List -------------------------------------------------- */}
        <div className="min-w-0 h-full flex flex-col gap-3 min-h-0">
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="relative flex-1 min-w-[180px]">
              <IconSearch
                width={14}
                height={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <input
                className="input pl-8"
                placeholder="Search requests…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All kinds</option>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
          {loading && <p className="text-sm text-muted px-1">Loading…</p>}

          {!loading && !visible.length && (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink font-medium">
                {inbox === 'awaiting_me' ? 'Nothing is waiting on you.' : 'No requests here.'}
              </p>
              <p className="text-sm text-muted mt-1">
                {inbox === 'awaiting_me'
                  ? 'Approvals assigned to you will show up here.'
                  : 'Raise one with “New request”.'}
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {visible.map((t) => {
              const chip = stateChip(t);
              const prio = priorityChip(t.priority);
              const due = dueState(t.due_at);
              const active = t.id === selectedId;
              const approvers = (t.participants || []).filter((p) => p.role === 'approver');
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`card w-full text-left p-3 gap-2 transition ${
                      active ? 'border-primary bg-acc-100/50' : 'hover:border-neutral-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className={kindBadge(t.kind)}>{kindLabel(t.kind)}</span>
                          <span className={chip.className}>{chip.label}</span>
                          {prio && <span className={prio.className}>{prio.label}</span>}
                        </div>
                        <h3 className="card-title truncate">{t.title}</h3>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {approvers.slice(0, 3).map((p) => (
                          <Avatar key={p.user_id} name={p.name} size={24} title={`${p.name} — approver`} />
                        ))}
                        {approvers.length > 3 && (
                          <span className="text-xs text-muted">+{approvers.length - 3}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>{t.owner_name || 'Unknown'}</span>
                      <span aria-hidden>·</span>
                      <span>{relativeTime(t.updated_at)}</span>
                      {t.attachments?.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <IconPaperclip width={12} height={12} /> {t.attachments.length}
                        </span>
                      )}
                      {t.comment_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <IconMessage width={12} height={12} /> {t.comment_count}
                        </span>
                      )}
                      {due && (
                        <span className={`inline-flex items-center gap-1 ${due.className}`}>
                          <IconClock width={12} height={12} /> {due.label}
                        </span>
                      )}
                      {t.unread_count > 0 && <span className="badge-accent ml-auto">{t.unread_count} new</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {resolvedHidden > 0 && !showResolved && (
            <button
              type="button"
              className="btn-ghost text-xs w-full justify-center"
              onClick={() => setShowResolved(true)}
            >
              Show {resolvedHidden} resolved
            </button>
          )}
          {showResolved && (
            <button
              type="button"
              className="btn-ghost text-xs w-full justify-center"
              onClick={() => setShowResolved(false)}
            >
              Hide resolved
            </button>
          )}
          </div>
        </div>

        {/* --- Detail ------------------------------------------------ */}
        {selectedTask && (
          <>
            {/* xl and up: a third column filling the row's full height. */}
            <div className="hidden xl:block h-full min-h-0 border border-line">
              <RequestDetail {...detailProps} />
            </div>

            {/* Below xl: the same pane as a right-hand overlay. */}
            <div className="xl:hidden fixed inset-0 z-40 flex justify-end">
              <div className="absolute inset-0 bg-ink/30" onClick={() => setSelectedId(null)} />
              <div className="relative w-full max-w-lg h-full">
                <RequestDetail {...detailProps} />
              </div>
            </div>
          </>
        )}
      </div>

      {composerOpen && (
        <RequestComposer
          users={users}
          clients={clients}
          projects={projects}
          documents={documents}
          me={me}
          onCancel={() => setComposerOpen(false)}
          onCreate={createRequest}
        />
      )}

      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          siblings={(selectedTask?.attachments || [])
            .map((a) => documents.find((d) => d.id === a.document_id))
            .filter(Boolean)}
          onClose={() => setPreviewDoc(null)}
          onNavigate={(d) => setPreviewDoc(d)}
        />
      )}
    </div>
  );
}
