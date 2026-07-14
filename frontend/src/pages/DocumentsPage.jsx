import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [d, c] = await Promise.all([
      api.documents.list(clientId ? { clientId } : {}),
      api.clients.list(),
    ]);
    setDocuments(d.documents);
    setClients(c.clients);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [clientId]);

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    await api.documents.upload(file, { title: title || file.name, clientId: clientId || undefined });
    setFile(null);
    setTitle('');
    setMsg('Uploaded');
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Shared documents</h1>
        <p className="text-sm text-muted mt-1">Org-wide library for uploaded and agent-organized files</p>
      </div>

      <form onSubmit={upload} className="card p-4 grid md:grid-cols-4 gap-3">
        <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">All / no client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="btn-primary" type="submit">Upload</button>
      </form>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-muted">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Uploader</th>
              <th className="px-4 py-3">File</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{d.title}</td>
                <td className="px-4 py-3 text-muted">{d.client_name || '—'}</td>
                <td className="px-4 py-3 text-muted">{d.uploader_name || '—'}</td>
                <td className="px-4 py-3">
                  <a className="text-primary hover:underline" href={`/api/documents/${d.id}/download`}>
                    {d.filename}
                  </a>
                </td>
              </tr>
            ))}
            {!documents.length && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No documents</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
