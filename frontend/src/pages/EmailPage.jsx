import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function EmailPage() {
  const [emails, setEmails] = useState([]);
  const [status, setStatus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [clients, setClients] = useState([]);
  const [orgClientId, setOrgClientId] = useState('');
  const [orgFile, setOrgFile] = useState(null);

  async function load() {
    const [e, s, c] = await Promise.all([
      api.emails.list(),
      api.emails.status(),
      api.clients.list(),
    ]);
    setEmails(e.emails);
    setStatus(s);
    setClients(c.clients);
  }

  useEffect(() => {
    load().catch((err) => setMsg(err.message));
  }, []);

  async function openEmail(id) {
    setSelected(id);
    const d = await api.emails.get(id);
    setDetail(d);
  }

  async function sync() {
    setMsg('Syncing…');
    const r = await api.emails.sync();
    setMsg(r.reason ? `Sync: ${r.reason}` : `Synced ${r.synced} messages`);
    await load();
  }

  async function sendReply(e) {
    e.preventDefault();
    await api.emails.reply(selected, { body: reply });
    setReply('');
    setMsg('Reply sent');
    await openEmail(selected);
  }

  async function addNote(e) {
    e.preventDefault();
    await api.emails.note(selected, note);
    setNote('');
    await openEmail(selected);
  }

  async function organize(e) {
    e.preventDefault();
    if (!orgClientId || !orgFile) return;
    const contentBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(orgFile);
    });
    const r = await api.emails.organize({
      clientId: orgClientId,
      files: [{ filename: orgFile.name, mimeType: orgFile.type, contentBase64 }],
    });
    setMsg(`Organized ${r.organized} file(s) into client`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">Email</h1>
          <p className="text-sm text-muted mt-1">
            Shared org inbox · {status?.connected ? status.email : 'not connected'}
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={sync}>Sync Gmail</button>
      </div>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 card overflow-hidden max-h-[70vh] overflow-y-auto">
          {emails.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => openEmail(m.id)}
              className={`w-full text-left px-4 py-3 border-b border-line hover:bg-slate-50 ${
                selected === m.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="text-sm font-medium truncate">{m.subject || '(no subject)'}</div>
              <div className="text-xs text-muted truncate">{m.from_address}</div>
              <div className="text-xs text-muted mt-1">
                {m.client_name ? `Client: ${m.client_name}` : 'Unlinked'}
              </div>
            </button>
          ))}
          {!emails.length && <div className="p-6 text-sm text-muted">No emails yet. Sync or connect Gmail.</div>}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="card p-5 min-h-[280px]">
            {!detail ? (
              <p className="text-muted text-sm">Select an email</p>
            ) : (
              <>
                <h2 className="font-medium text-lg">{detail.email.subject}</h2>
                <p className="text-xs text-muted mt-1">{detail.email.from_address}</p>
                <pre className="mt-4 text-sm whitespace-pre-wrap font-sans">{detail.body || detail.email.snippet}</pre>
                <form onSubmit={sendReply} className="mt-6 space-y-2">
                  <textarea className="input min-h-[100px]" placeholder="Reply…" value={reply}
                    onChange={(e) => setReply(e.target.value)} />
                  <button className="btn-primary" type="submit">Send reply</button>
                </form>
                <form onSubmit={addNote} className="mt-4 flex gap-2">
                  <input className="input" placeholder="Internal note" value={note}
                    onChange={(e) => setNote(e.target.value)} />
                  <button className="btn-secondary" type="submit">Save note</button>
                </form>
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {detail.notes?.map((n) => (
                    <li key={n.id}>{n.author_name}: {n.note}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <form onSubmit={organize} className="card p-5 space-y-3">
            <h3 className="font-medium">Organize file into client DB</h3>
            <select className="input" value={orgClientId} onChange={(e) => setOrgClientId(e.target.value)}>
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="file" onChange={(e) => setOrgFile(e.target.files?.[0] || null)} />
            <button className="btn-secondary" type="submit">Run organize agent</button>
          </form>
        </div>
      </div>
    </div>
  );
}
