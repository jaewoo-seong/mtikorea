import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import RichComposer from '../components/email/RichComposer';

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function displayName(from) {
  if (!from) return '(unknown)';
  const m = from.match(/^"?([^"<]+)"?\s*</);
  return (m?.[1] || from).trim();
}

function sanitizeHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

const FOLDER_LABELS = {
  inbox: 'Inbox',
  starred: 'Starred',
  important: 'Important',
  sent: 'Sent',
  drafts: 'Drafts',
  spam: 'Spam',
  trash: 'Trash',
  all: 'All mail',
};

export default function EmailPage() {
  const { folder: folderParam } = useParams();
  const folder = FOLDER_LABELS[folderParam] ? folderParam : 'inbox';

  const [emails, setEmails] = useState([]);
  const [status, setStatus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [composer, setComposer] = useState(null);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState({ to: '', cc: '', bcc: '', subject: '', html: '' });
  const [note, setNote] = useState('');
  const [clients, setClients] = useState([]);
  const [showBcc, setShowBcc] = useState(false);

  const loadList = useCallback(async () => {
    const params = { folder };
    if (search.trim()) params.q = search.trim();
    const [e, s] = await Promise.all([api.emails.list(params), api.emails.status()]);
    setEmails(e.emails);
    setStatus(s);
  }, [folder, search]);

  useEffect(() => {
    setSelected(null);
    setDetail(null);
    setComposer(null);
    loadList().catch((err) => setMsg(err.message));
    api.clients.list().then((d) => setClients(d.clients)).catch(() => {});
  }, [loadList]);

  async function openEmail(id) {
    setComposer(null);
    setSelected(id);
    const d = await api.emails.get(id);
    setDetail(d);
    setEmails((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)));
  }

  async function syncAll() {
    setSyncing(true);
    setMsg('Syncing mailbox folders…');
    try {
      const r = await api.emails.sync({ max: 60 });
      setMsg(r.reason ? `Sync: ${r.reason}` : `Synced ${r.synced} messages`);
      await loadList();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function runAction(action) {
    if (!selected) return;
    await api.emails.action(selected, action);
    setMsg(`Done: ${action}`);
    if (['trash', 'spam', 'archive'].includes(action)) {
      setSelected(null);
      setDetail(null);
    } else if (detail) await openEmail(selected);
    await loadList();
  }

  async function linkClient(clientId) {
    if (!selected) return;
    await api.emails.linkClient(selected, clientId || null);
    setMsg(clientId ? 'Linked to client' : 'Unlinked from client');
    await openEmail(selected);
    await loadList();
  }

  function startCompose() {
    setSelected(null);
    setDetail(null);
    setDraft({ to: '', cc: '', bcc: '', subject: '', html: '<p><br/></p>' });
    setComposer('compose');
  }

  function startReply() {
    if (!detail?.email) return;
    const e = detail.email;
    setDraft({
      to: e.from_address || '',
      cc: '',
      bcc: '',
      subject: e.subject?.startsWith('Re:') ? e.subject : `Re: ${e.subject || ''}`,
      html: `<p><br/></p><blockquote style="border-left:3px solid #e5e7eb;padding-left:12px;color:#64748b">${
        detail.bodyHtml || `<pre>${detail.body || e.snippet || ''}</pre>`
      }</blockquote>`,
    });
    setComposer('reply');
  }

  function startForward() {
    if (!detail?.email) return;
    const e = detail.email;
    setDraft({
      to: '',
      cc: '',
      bcc: '',
      subject: e.subject?.startsWith('Fwd:') ? e.subject : `Fwd: ${e.subject || ''}`,
      html: '<p><br/></p>',
    });
    setComposer('forward');
  }

  async function handleSend({ html, text }) {
    setSending(true);
    try {
      if (composer === 'compose') {
        await api.emails.compose({
          to: draft.to,
          cc: draft.cc ? draft.cc.split(',').map((s) => s.trim()) : [],
          bcc: draft.bcc ? draft.bcc.split(',').map((s) => s.trim()) : [],
          subject: draft.subject,
          html,
          text,
        });
      } else if (composer === 'reply') {
        await api.emails.reply(selected, {
          to: draft.to,
          cc: draft.cc,
          subject: draft.subject,
          html,
          text,
        });
      } else if (composer === 'forward') {
        await api.emails.forward(selected, {
          to: draft.to,
          cc: draft.cc,
          subject: draft.subject,
          html,
          text,
        });
      }
      setComposer(null);
      setMsg('Message sent');
      await loadList();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSending(false);
    }
  }

  async function addNote(e) {
    e.preventDefault();
    if (!selected || !note.trim()) return;
    await api.emails.note(selected, note.trim());
    setNote('');
    await openEmail(selected);
  }

  const listTitle = FOLDER_LABELS[folder] || 'Mail';

  return (
    <div className="h-[calc(100vh)] flex flex-col bg-[#f3f4f6]">
      <div className="h-14 shrink-0 px-4 border-b border-line bg-white flex items-center gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{listTitle}</div>
          <div className="text-xs text-muted truncate">
            {status?.connected ? status.email : 'Gmail not connected'}
          </div>
        </div>
        <div className="flex-1 max-w-xl mx-auto">
          <input
            className="input bg-slate-100 border-transparent focus:bg-white"
            placeholder={`Search ${listTitle.toLowerCase()}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') loadList();
            }}
          />
        </div>
        <button type="button" className="btn-secondary" disabled={syncing} onClick={syncAll}>
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
        <button type="button" className="btn-primary" onClick={startCompose}>
          Compose
        </button>
      </div>

      {msg && (
        <div className="px-4 py-2 text-xs bg-blue-50 text-primary border-b border-blue-100 flex justify-between">
          <span>{msg}</span>
          <button type="button" className="underline" onClick={() => setMsg('')}>
            dismiss
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(280px,400px)_1fr]">
        <section className="border-r border-line bg-white flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            {emails.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => openEmail(m.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-line/70 hover:shadow-soft transition ${
                  selected === m.id ? 'bg-blue-50' : m.read ? 'bg-white' : 'bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 text-sm ${m.flagged ? 'text-accent' : 'text-slate-300'}`}>★</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm truncate ${m.read ? 'font-medium text-slate-700' : 'font-bold text-ink'}`}>
                        {folder === 'sent' ? m.to_address || '(no recipient)' : displayName(m.from_address)}
                      </span>
                      <span className="text-[11px] text-muted shrink-0">
                        {formatWhen(m.received_at || m.sent_at || m.created_at)}
                      </span>
                    </div>
                    <div className={`text-sm truncate ${m.read ? 'text-slate-600' : 'font-semibold text-ink'}`}>
                      {m.subject || '(no subject)'}
                      {m.has_attachments ? ' 📎' : ''}
                    </div>
                    <div className="text-xs text-muted truncate mt-0.5">{m.snippet || '—'}</div>
                    {m.client_name && (
                      <div className="mt-1">
                        <span className="badge bg-emerald-50 text-success">{m.client_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {!emails.length && (
              <div className="p-8 text-sm text-muted text-center">No messages. Try Sync.</div>
            )}
          </div>
        </section>

        <section className="min-h-0 bg-[#fafafa] p-3 overflow-hidden flex flex-col">
          {composer ? (
            <RichComposer
              mode={composer}
              initialHtml={draft.html}
              to={draft.to}
              cc={draft.cc}
              bcc={draft.bcc}
              subject={draft.subject}
              showBcc={showBcc}
              sending={sending}
              onToChange={(v) => setDraft((d) => ({ ...d, to: v }))}
              onCcChange={(v) => setDraft((d) => ({ ...d, cc: v }))}
              onBccChange={(v) => setDraft((d) => ({ ...d, bcc: v }))}
              onSubjectChange={(v) => setDraft((d) => ({ ...d, subject: v }))}
              onCancel={() => setComposer(null)}
              onSend={handleSend}
            />
          ) : !detail ? (
            <div className="h-full grid place-items-center text-muted text-sm card gap-2">
              <div>Select a message or compose</div>
              <button type="button" className="btn-ghost text-xs" onClick={() => setShowBcc((v) => !v)}>
                {showBcc ? 'Hide Bcc' : 'Show Bcc in composer'}
              </button>
            </div>
          ) : (
            <div className="h-full min-h-0 flex flex-col card overflow-hidden">
              <div className="px-5 py-4 border-b border-line shrink-0 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold leading-snug">{detail.email.subject || '(no subject)'}</h2>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className="btn-secondary" onClick={startReply}>Reply</button>
                    <button type="button" className="btn-secondary" onClick={startForward}>Forward</button>
                    <button type="button" className="btn-ghost" onClick={() => runAction(detail.email.flagged ? 'unstar' : 'star')}>
                      {detail.email.flagged ? 'Unstar' : 'Star'}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => runAction('archive')}>Archive</button>
                    <button type="button" className="btn-ghost" onClick={() => runAction(detail.email.folder === 'spam' ? 'unspam' : 'spam')}>
                      {detail.email.folder === 'spam' ? 'Not spam' : 'Spam'}
                    </button>
                    <button type="button" className="btn-ghost text-danger" onClick={() => runAction(detail.email.folder === 'trash' ? 'restore' : 'trash')}>
                      {detail.email.folder === 'trash' ? 'Restore' : 'Trash'}
                    </button>
                  </div>
                </div>
                <div className="text-sm">
                  <div className="font-medium">{detail.email.from_address}</div>
                  <div className="text-muted text-xs mt-1">
                    To {detail.email.to_address || '—'} · {formatWhen(detail.email.received_at || detail.email.sent_at)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-xs text-muted">Client database</span>
                  <select
                    className="input w-auto min-w-[200px]"
                    value={detail.email.client_id || ''}
                    onChange={(e) => linkClient(e.target.value || null)}
                  >
                    <option value="">Unlinked</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {detail.email.client_id && (
                    <Link className="text-xs text-primary hover:underline" to={`/clients/${detail.email.client_id}`}>
                      Open client →
                    </Link>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 bg-white">
                {detail.bodyHtml ? (
                  <div
                    className="email-body text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.bodyHtml) }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm">{detail.body || detail.email.snippet}</pre>
                )}
              </div>

              <div className="border-t border-line p-4 bg-slate-50 shrink-0 space-y-3">
                <form onSubmit={addNote} className="flex gap-2">
                  <input className="input" placeholder="Internal CRM note" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button className="btn-secondary" type="submit">Note</button>
                </form>
                {!!detail.notes?.length && (
                  <ul className="text-xs text-muted space-y-1">
                    {detail.notes.map((n) => (
                      <li key={n.id}><span className="font-medium text-ink">{n.author_name}:</span> {n.note}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
