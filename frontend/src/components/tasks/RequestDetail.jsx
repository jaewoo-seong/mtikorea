import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IconCheck,
  IconX,
  IconFile,
  IconClock,
  IconPaperclip,
  IconUserPlus,
  IconRotate,
  IconChevronRight,
} from '../../lib/icons';
import {
  kindLabel,
  kindBadge,
  stateChip,
  priorityChip,
  dueState,
  dayLabel,
  timeOnly,
  formatDateTime,
  formatBytes,
  groupThread,
  handleOf,
  isResolved,
} from '../../lib/taskMeta';
import PeoplePicker, { Avatar } from './PeoplePicker';
import DocumentPicker from './DocumentPicker';

/** Bold/colored @handle tokens inside a message body. */
function renderBody(body) {
  return body.split(/(@[a-zA-Z0-9_-]+)/g).map((part, i) =>
    /^@[a-zA-Z0-9_-]+$/.test(part) ? (
      <span key={i} className="font-semibold underline underline-offset-2">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// Decisions are the point of the whole thread, so they get a card in the
// stream. Everything else is a one-line aside.
const DECISION_STYLE = {
  approved: {
    label: 'approved this request',
    icon: IconCheck,
    border: 'border-success',
    tint: 'bg-emerald-50',
    text: 'text-success',
  },
  rejected: {
    label: 'rejected this request',
    icon: IconX,
    border: 'border-danger',
    tint: 'bg-red-50',
    text: 'text-danger',
  },
  changes_requested: {
    label: 'requested changes',
    icon: IconRotate,
    border: 'border-amber-300',
    tint: 'bg-amber-50',
    text: 'text-amber-900',
  },
};

const ASIDE_TEXT = {
  created: () => 'started this request',
  reopened: () => 'reopened this request',
  status_changed: (p) => `moved this to ${String(p.to || '').replace('_', ' ')}`,
  participant_added: (p) => `joined as ${p.role}`,
  participant_removed: () => 'left this request',
  attachment_removed: () => 'removed a document',
};

function DayDivider({ at }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-[color:var(--divider)]" />
      <span className="text-xs text-muted uppercase tracking-wide">{dayLabel(at)}</span>
      <span className="h-px flex-1 bg-[color:var(--divider)]" />
    </div>
  );
}

function DecisionCard({ event }) {
  const style = DECISION_STYLE[event.type];
  const Icon = style.icon;
  const note = event.payload?.note;
  return (
    <div className={`border-l-2 ${style.border} ${style.tint} px-3 py-2.5`}>
      <div className={`flex items-center gap-2 text-sm font-medium ${style.text}`}>
        <Icon width={15} height={15} className="shrink-0" />
        <span className="text-ink">
          <span className="font-semibold">{event.actor_name || 'Someone'}</span> {style.label}
        </span>
        <span className="ml-auto text-xs text-muted font-normal shrink-0 tabular-nums">
          {timeOnly(event.created_at)}
        </span>
      </div>
      {note && <p className="text-sm text-ink mt-1.5 whitespace-pre-wrap break-words">“{note}”</p>}
    </div>
  );
}

function AttachmentEvent({ event, doc, onPreview }) {
  return (
    <div className="flex items-center gap-2.5 border border-line bg-surface px-3 py-2">
      <IconPaperclip width={14} height={14} className="text-muted shrink-0" />
      <span className="text-xs text-muted shrink-0">
        <span className="font-medium text-ink">{event.actor_name || 'Someone'}</span> shared
      </span>
      {doc ? (
        <button
          type="button"
          className="flex-1 min-w-0 text-left text-sm text-primary hover:underline truncate"
          onClick={() => onPreview(doc.id)}
        >
          {doc.title}
        </button>
      ) : (
        <span className="flex-1 min-w-0 text-sm text-muted truncate">a document</span>
      )}
      <span className="text-xs text-muted shrink-0 tabular-nums">{timeOnly(event.created_at)}</span>
    </div>
  );
}

function Aside({ event }) {
  const text = ASIDE_TEXT[event.type]?.(event.payload || {}) || event.type;
  return (
    <p className="text-xs text-muted text-center py-0.5">
      <span className="font-medium">{event.actor_name || 'Someone'}</span> {text} ·{' '}
      <span className="tabular-nums">{timeOnly(event.created_at)}</span>
    </p>
  );
}

function MessageGroup({ block, mine }) {
  return (
    <div className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
      <Avatar name={block.author_name} size={28} />
      <div className={`min-w-0 max-w-[85%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`flex items-baseline gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs font-semibold text-ink">
            {mine ? 'You' : block.author_name || 'Unknown'}
          </span>
          <span className="text-xs text-muted tabular-nums">{timeOnly(block.created_at)}</span>
        </div>
        {block.messages.map((m) => (
          <div
            key={m.id}
            className={`px-3 py-2 text-sm whitespace-pre-wrap break-words ${
              mine ? 'bg-primary text-canvas' : 'bg-surface text-ink border border-line'
            }`}
          >
            {renderBody(m.body)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RequestDetail({
  task,
  thread,
  threadLoading,
  users,
  clients,
  documents,
  me,
  onClose,
  onDecide,
  onComment,
  onAddParticipants,
  onRemoveParticipant,
  onAddAttachments,
  onRemoveAttachment,
  onReopen,
  onPreviewDocument,
}) {
  const [commentText, setCommentText] = useState('');
  const [mentionQuery, setMentionQuery] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [pendingDecision, setPendingDecision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addingPeople, setAddingPeople] = useState(false);
  const [newPeople, setNewPeople] = useState([]);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const streamRef = useRef(null);
  const inputRef = useRef(null);

  const participants = task.participants || [];
  const attachments = task.attachments || [];
  const approvers = participants.filter((p) => p.role === 'approver');
  const followers = participants.filter((p) => p.role === 'follower');
  const owner = participants.find((p) => p.role === 'owner');

  const chip = stateChip(task);
  const prio = priorityChip(task.priority);
  const due = dueState(task.due_at);
  const resolved = isResolved(task);

  // Only a named approver (or the owner) gets the decision bar — everyone else
  // sees the same conversation without buttons they can't meaningfully press.
  //
  // Anything not yet resolved is still decidable: "changes requested" is a turn
  // in the conversation, not an outcome, so the approver has to be able to come
  // back and approve once the requester has answered.
  const canDecide =
    !resolved &&
    (approvers.some((p) => p.user_id === me?.id) ||
      owner?.user_id === me?.id ||
      me?.role === 'admin');

  const blocks = useMemo(() => groupThread(thread), [thread]);
  const docById = useMemo(() => new Map(documents.map((d) => [d.id, d])), [documents]);

  // Keep the newest message in view, the way a chat pane behaves.
  useLayoutEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, task.id]);

  useEffect(() => {
    setCommentText('');
    setDecisionNote('');
    setPendingDecision(null);
    setAddingPeople(false);
    setNewPeople([]);
    setDetailsOpen(false);
  }, [task.id]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return users
      .filter(
        (u) => handleOf(u).includes(mentionQuery) || (u.name || '').toLowerCase().includes(mentionQuery)
      )
      .slice(0, 5);
  }, [users, mentionQuery]);

  function onCommentChange(e) {
    const val = e.target.value;
    setCommentText(val);
    const cursor = e.target.selectionStart ?? val.length;
    const match = /@([a-zA-Z0-9_-]*)$/.exec(val.slice(0, cursor));
    setMentionQuery(match ? match[1].toLowerCase() : null);
  }

  async function submitComment(e) {
    e?.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    setCommentText('');
    setMentionQuery(null);
    await onComment(text);
  }

  async function confirmDecision() {
    setBusy(true);
    try {
      await onDecide(pendingDecision, decisionNote.trim());
      setPendingDecision(null);
      setDecisionNote('');
    } finally {
      setBusy(false);
    }
  }

  const DECISION_COPY = {
    approved: { verb: 'Approve', placeholder: 'Add a note with your approval… (optional)', btn: 'btn-primary' },
    rejected: { verb: 'Reject', placeholder: 'Why is this rejected?', btn: 'btn-danger' },
    changes_requested: {
      verb: 'Request changes',
      placeholder: 'What needs to change?',
      btn: 'btn-secondary',
    },
  };

  return (
    <>
      <aside className="flex flex-col h-full bg-canvas border-l border-line min-w-0">
        {/* --- Header: identity + a one-line summary of everything else --- */}
        <header className="px-4 py-3 border-b border-line shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className={kindBadge(task.kind)}>{kindLabel(task.kind)}</span>
                <span className={chip.className}>{chip.label}</span>
                {prio && <span className={prio.className}>{prio.label}</span>}
              </div>
              <h2 className="font-display text-lg font-semibold leading-snug text-ink break-words">
                {task.title}
              </h2>
            </div>
            <button
              type="button"
              className="btn-ghost p-1.5 shrink-0 xl:hidden"
              onClick={onClose}
              aria-label="Close request"
            >
              <IconX width={16} height={16} />
            </button>
          </div>

          {/* Everything the conversation needs at a glance, one row, always
              visible — the full panel is one click away rather than pushing the
              messages down the pane. */}
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="mt-2 w-full flex items-center gap-2 text-xs text-muted hover:text-ink"
          >
            <IconChevronRight
              width={13}
              height={13}
              className={`shrink-0 transition-transform ${detailsOpen ? 'rotate-90' : ''}`}
            />
            <span className="flex items-center gap-1">
              {approvers.slice(0, 3).map((p) => (
                <Avatar key={p.user_id} name={p.name} size={18} title={`${p.name} — approver`} />
              ))}
            </span>
            <span className="truncate">
              {participants.length} {participants.length === 1 ? 'person' : 'people'}
              {attachments.length > 0 && ` · ${attachments.length} doc${attachments.length > 1 ? 's' : ''}`}
              {due && ` · ${due.label}`}
            </span>
            <span className="ml-auto shrink-0">{detailsOpen ? 'Hide details' : 'Details'}</span>
          </button>
        </header>

        {/* --- Collapsible details ------------------------------------- */}
        {detailsOpen && (
          <div className="px-4 py-3 border-b border-line shrink-0 max-h-[45%] overflow-y-auto space-y-4 bg-black/[0.015]">
            <p className="text-xs text-muted">
              Raised by {owner?.name || task.owner_name || 'Unknown'} · {formatDateTime(task.created_at)}
            </p>

            {/* The ask itself isn't repeated here — it opens the thread. */}

            {(task.client_id || task.project_id) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                {task.client_id && (
                  <Link to={`/clients/${task.client_id}`} className="text-primary hover:underline">
                    {task.client_name}
                  </Link>
                )}
                {task.project_id && (
                  <Link to={`/projects/${task.project_id}`} className="text-primary hover:underline">
                    {task.project_title || 'Project'}
                  </Link>
                )}
              </div>
            )}

            <section>
              <h3 className="card-kicker mb-2">Documents</h3>
              {attachments.length ? (
                <ul className="border border-line">
                  {attachments.map((d, i) => (
                    <li
                      key={d.id}
                      className={`flex items-center gap-2.5 px-3 py-2 group ${
                        i ? 'border-t border-line' : ''
                      }`}
                    >
                      <IconFile width={15} height={15} className="text-muted shrink-0" />
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left"
                        onClick={() => onPreviewDocument(d.document_id)}
                      >
                        <span className="block truncate text-sm text-ink group-hover:text-primary">
                          {d.title}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {d.filename} · {formatBytes(d.size_bytes)}
                        </span>
                      </button>
                      <a
                        href={`/api/documents/${d.document_id}/download`}
                        className="btn-ghost text-xs shrink-0"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className="btn-ghost p-1 text-muted hover:text-danger shrink-0"
                        onClick={() => onRemoveAttachment(d.document_id)}
                        aria-label={`Remove ${d.title}`}
                      >
                        <IconX width={14} height={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted border border-dashed border-line px-3 py-3 text-center">
                  Nothing attached yet — use the clip in the message box.
                </p>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="card-kicker">People</h3>
                <button
                  type="button"
                  className="btn-ghost inline-flex items-center gap-1.5 text-xs"
                  onClick={() => setAddingPeople((v) => !v)}
                >
                  <IconUserPlus width={13} height={13} /> Add
                </button>
              </div>
              <div className="space-y-2">
                <PersonRow label="Approvers" people={approvers} meId={me?.id} onRemove={onRemoveParticipant} />
                {followers.length > 0 && (
                  <PersonRow
                    label="Following"
                    people={followers}
                    meId={me?.id}
                    onRemove={onRemoveParticipant}
                  />
                )}
              </div>
              {addingPeople && (
                <div className="mt-3 border border-line p-3 space-y-2">
                  <PeoplePicker
                    users={users}
                    selectedIds={newPeople}
                    onChange={setNewPeople}
                    excludeIds={participants.map((p) => p.user_id)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary text-xs flex-1"
                      disabled={!newPeople.length}
                      onClick={async () => {
                        await onAddParticipants(newPeople, 'approver');
                        setNewPeople([]);
                        setAddingPeople(false);
                      }}
                    >
                      Add as approver
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs flex-1"
                      disabled={!newPeople.length}
                      onClick={async () => {
                        await onAddParticipants(newPeople, 'follower');
                        setNewPeople([]);
                        setAddingPeople(false);
                      }}
                    >
                      Just notify
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* --- The conversation ---------------------------------------- */}
        <div ref={streamRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-3">
          {threadLoading && <p className="text-sm text-muted text-center">Loading…</p>}

          {/* The opening ask reads as the first message in the thread, so the
              conversation starts with what was actually asked. */}
          {!threadLoading && task.description && (
            <div className="border-l-2 border-primary bg-acc-100/60 px-3 py-2.5">
              <p className="text-xs text-muted mb-1">
                <span className="font-semibold text-ink">
                  {owner?.name || task.owner_name || 'Unknown'}
                </span>{' '}
                asked
              </p>
              <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{task.description}</p>
            </div>
          )}

          {blocks.map((block) => {
            if (block.type === 'day') return <DayDivider key={block.id} at={block.created_at} />;
            if (block.type === 'messages') {
              return <MessageGroup key={block.id} block={block} mine={block.author_id === me?.id} />;
            }
            const e = block.event;
            if (DECISION_STYLE[e.type]) return <DecisionCard key={block.id} event={e} />;
            if (e.type === 'attachment_added') {
              return (
                <AttachmentEvent
                  key={block.id}
                  event={e}
                  doc={docById.get(e.payload?.document_id)}
                  onPreview={onPreviewDocument}
                />
              );
            }
            return <Aside key={block.id} event={e} />;
          })}

          {!threadLoading && !blocks.length && !task.description && (
            <p className="text-sm text-muted text-center py-6">
              No messages yet — say something below.
            </p>
          )}
        </div>

        {/* --- Decision, sitting where the conversation happens --------- */}
        {canDecide && (
          <div className="px-4 py-3 border-t border-line shrink-0 bg-acc-100/50">
            {!pendingDecision ? (
              <>
                <p className="text-xs text-muted mb-2">
                  {task.decision === 'changes_requested'
                    ? 'You asked for changes — decide again once they’ve answered.'
                    : task.kind === 'approval'
                      ? 'This is waiting on your decision.'
                      : 'Close this out when you’re done.'}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center justify-center gap-1.5 text-sm"
                    onClick={() => setPendingDecision('approved')}
                  >
                    <IconCheck width={14} height={14} /> Approve
                  </button>
                  <button
                    type="button"
                    className="btn-secondary inline-flex items-center justify-center gap-1.5 text-sm bg-canvas"
                    onClick={() => setPendingDecision('changes_requested')}
                  >
                    <IconRotate width={14} height={14} /> Changes
                  </button>
                  <button
                    type="button"
                    className="btn-danger inline-flex items-center justify-center gap-1.5 text-sm"
                    onClick={() => setPendingDecision('rejected')}
                  >
                    <IconX width={14} height={14} /> Reject
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted">
                  {DECISION_COPY[pendingDecision].verb} — this is posted to the thread.
                </p>
                <textarea
                  className="input min-h-[60px] text-sm bg-canvas"
                  autoFocus
                  placeholder={DECISION_COPY[pendingDecision].placeholder}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${DECISION_COPY[pendingDecision].btn} flex-1 text-sm`}
                    disabled={busy}
                    onClick={confirmDecision}
                  >
                    {busy ? 'Saving…' : `Confirm ${DECISION_COPY[pendingDecision].verb.toLowerCase()}`}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-sm bg-canvas"
                    onClick={() => setPendingDecision(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {resolved && (
          <div className="px-4 py-2.5 border-t border-line shrink-0 bg-surface flex items-center justify-between gap-3">
            <p className="text-sm text-ink">
              {chip.label}
              {task.decided_at ? ` · ${formatDateTime(task.decided_at)}` : ''}
            </p>
            <button
              type="button"
              className="btn-secondary text-xs inline-flex items-center gap-1.5 shrink-0"
              onClick={onReopen}
            >
              <IconRotate width={13} height={13} /> Reopen
            </button>
          </div>
        )}

        {/* --- Composer ------------------------------------------------ */}
        <form onSubmit={submitComment} className="relative border-t border-line p-3 shrink-0">
          {mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-canvas border border-line-strong shadow-mid">
              {mentionSuggestions.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-acc-100 flex items-center justify-between gap-2"
                  onClick={() => {
                    setCommentText((prev) => prev.replace(/@([a-zA-Z0-9_-]*)$/, `@${handleOf(u)} `));
                    setMentionQuery(null);
                    inputRef.current?.focus();
                  }}
                >
                  <span className="truncate">{u.name || u.email}</span>
                  <span className="text-xs text-muted font-mono shrink-0">@{handleOf(u)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="btn-secondary p-2 shrink-0"
              onClick={() => setDocPickerOpen(true)}
              title="Attach a document to this conversation"
              aria-label="Attach a document"
            >
              <IconPaperclip width={16} height={16} />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              className="input resize-none max-h-32 py-2 leading-snug"
              placeholder="Write a message… (@ to pull someone in)"
              value={commentText}
              onChange={(e) => {
                onCommentChange(e);
                // Grow with the message, up to the max-height, so long replies
                // aren't typed through a one-line slot.
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && mentionQuery !== null) {
                  e.stopPropagation();
                  setMentionQuery(null);
                  return;
                }
                // Enter sends; Shift+Enter is a newline, as in any message box.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.target.style.height = 'auto';
                  submitComment(e);
                }
              }}
            />
            <button className="btn-primary shrink-0" type="submit" disabled={!commentText.trim()}>
              Send
            </button>
          </div>
        </form>
      </aside>

      {docPickerOpen && (
        <DocumentPicker
          documents={documents}
          clients={clients}
          alreadyAttachedIds={attachments.map((a) => a.document_id)}
          onCancel={() => setDocPickerOpen(false)}
          onConfirm={async (ids) => {
            setDocPickerOpen(false);
            await onAddAttachments(ids);
          }}
        />
      )}
    </>
  );
}

function PersonRow({ label, people, meId, onRemove }) {
  if (!people.length) {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted w-20 shrink-0">{label}</span>
        <span className="text-xs text-muted">None</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-muted w-20 shrink-0 pt-1">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => (
          <span
            key={p.user_id}
            className="inline-flex items-center gap-1.5 border border-line bg-surface pl-1 pr-1.5 py-0.5 text-xs group"
          >
            <Avatar name={p.name} size={18} />
            <span className="text-ink">
              {p.name}
              {p.user_id === meId && <span className="text-muted"> (you)</span>}
            </span>
            <button
              type="button"
              className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={() => onRemove(p.user_id)}
              aria-label={`Remove ${p.name}`}
            >
              <IconX width={11} height={11} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
