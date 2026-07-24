import { useEffect, useState } from 'react';
import { IconX, IconFile, IconPaperclip } from '../../lib/icons';
import { KINDS, PRIORITIES, formatBytes } from '../../lib/taskMeta';
import PeoplePicker from './PeoplePicker';
import DocumentPicker from './DocumentPicker';

/**
 * "New request" modal.
 *
 * The previous page kept eight form controls permanently expanded above the
 * board. Everything lives here now, grouped into three plain sections — what
 * you're asking, who has to answer, and what they need to read — so the page
 * behind it is just the work.
 */
export default function RequestComposer({ users, clients, projects, documents, me, onCancel, onCreate }) {
  const [form, setForm] = useState({
    kind: 'approval',
    title: '',
    description: '',
    priority: 'normal',
    dueAt: '',
    clientId: '',
    projectId: '',
  });
  const [approverIds, setApproverIds] = useState([]);
  const [followerIds, setFollowerIds] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !pickerOpen) onCancel();
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel, pickerOpen]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) return setError('Give the request a title.');
    if (!approverIds.length) return setError('Pick at least one person to send this to.');
    setError('');
    setBusy(true);
    try {
      await onCreate({
        ...form,
        title: form.title.trim(),
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        approverIds,
        followerIds,
        documentIds: attachments.map((d) => d.id),
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-ink/40" onClick={onCancel} />
        <form
          onSubmit={submit}
          className="relative w-full max-w-2xl max-h-[90vh] bg-canvas border border-line-strong shadow-mid flex flex-col"
        >
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-line">
            <h2 className="font-display text-xl font-semibold">New request</h2>
            <button type="button" className="btn-ghost p-1.5" onClick={onCancel} aria-label="Close">
              <IconX width={16} height={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* --- What ------------------------------------------------- */}
            <section className="space-y-3">
              <h3 className="card-kicker">What are you asking?</h3>
              <div className="seg flex-wrap">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    title={k.hint}
                    className={`seg-opt ${form.kind === k.key ? 'seg-opt-active' : ''}`}
                    onClick={() => set({ kind: k.key })}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <input
                className="input"
                autoFocus
                placeholder="Short, specific title — e.g. “Approve the Q3 vendor contract”"
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
              />
              <textarea
                className="input min-h-[96px]"
                placeholder="Context: what you need, by when, and what a good answer looks like."
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </section>

            {/* --- Who ------------------------------------------------- */}
            <section className="space-y-3 border-t border-line pt-5">
              <h3 className="card-kicker">Who needs to respond?</h3>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  Approvers <span className="text-muted font-normal">— they can approve or reject</span>
                </label>
                <PeoplePicker
                  users={users}
                  selectedIds={approverIds}
                  onChange={setApproverIds}
                  excludeIds={followerIds}
                  placeholder="Search teammates…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  Also notify <span className="text-muted font-normal">— they can join the thread</span>
                </label>
                <PeoplePicker
                  users={users}
                  selectedIds={followerIds}
                  onChange={setFollowerIds}
                  excludeIds={[...approverIds, me?.id].filter(Boolean)}
                  placeholder="Optional…"
                />
              </div>
            </section>

            {/* --- Documents ------------------------------------------- */}
            <section className="space-y-3 border-t border-line pt-5">
              <h3 className="card-kicker">What should they look at?</h3>
              {attachments.length > 0 && (
                <ul className="border border-line divide-y divide-[color:var(--divider)]">
                  {attachments.map((d) => (
                    <li key={d.id} className="flex items-center gap-2.5 px-3 py-2">
                      <IconFile width={15} height={15} className="text-muted shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm text-ink">{d.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {d.filename} · {formatBytes(d.size_bytes)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn-ghost p-1 text-muted hover:text-danger"
                        onClick={() => setAttachments((a) => a.filter((x) => x.id !== d.id))}
                        aria-label={`Remove ${d.title}`}
                      >
                        <IconX width={14} height={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-2"
                onClick={() => setPickerOpen(true)}
              >
                <IconPaperclip width={14} height={14} /> Attach documents
              </button>
            </section>

            {/* --- Details --------------------------------------------- */}
            <section className="space-y-3 border-t border-line pt-5">
              <h3 className="card-kicker">Details</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-sm font-medium text-ink mb-1.5">Priority</span>
                  <select
                    className="input"
                    value={form.priority}
                    onChange={(e) => set({ priority: e.target.value })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-ink mb-1.5">Due</span>
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.dueAt}
                    onChange={(e) => set({ dueAt: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-ink mb-1.5">Client</span>
                  <select
                    className="input"
                    value={form.clientId}
                    onChange={(e) => set({ clientId: e.target.value })}
                  >
                    <option value="">None</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-ink mb-1.5">Project</span>
                  <select
                    className="input"
                    value={form.projectId}
                    onChange={(e) => set({ projectId: e.target.value })}
                  >
                    <option value="">None</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          </div>

          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-line">
            <span className="text-sm text-danger">{error}</span>
            <div className="flex gap-2 shrink-0">
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {pickerOpen && (
        <DocumentPicker
          documents={documents}
          clients={clients}
          alreadyAttachedIds={attachments.map((d) => d.id)}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(ids) => {
            setAttachments((a) => [...a, ...documents.filter((d) => ids.includes(d.id))]);
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}
