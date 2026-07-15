import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clientId, setClientId] = useState(searchParams.get('clientId') || '');
  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '');
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [d, c, p] = await Promise.all([
      api.documents.list({
        clientId: clientId || undefined,
        projectId: projectId || undefined,
      }),
      api.clients.list(),
      api.projects.list(),
    ]);
    setDocuments(d.documents);
    setClients(c.clients);
    setProjects(p.projects);
  }

  useEffect(() => {
    const next = {};
    if (clientId) next.clientId = clientId;
    if (projectId) next.projectId = projectId;
    setSearchParams(next, { replace: true });
    load().catch((e) => setMsg(e.message));
  }, [clientId, projectId]);

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    await api.documents.upload(file, {
      title: title || file.name,
      clientId: clientId || undefined,
      projectId: projectId || undefined,
    });
    setFile(null);
    setTitle('');
    setMsg('Uploaded — linked to filters above');
    await load();
  }

  async function relink(docId, fields) {
    await api.documents.update(docId, fields);
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Shared documents</h1>
        <p className="text-sm text-muted mt-1">
          Approved library only. Agent outputs stay hidden in project staging until someone clicks Approve.
          Title = document ID for references. Link to client / project either way.
        </p>
      </div>

      <div className="card p-4 grid md:grid-cols-3 gap-3">
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={() => { setClientId(''); setProjectId(''); }}>
          Clear filters
        </button>
      </div>

      <form onSubmit={upload} className="card p-4 grid md:grid-cols-4 gap-3">
        <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div className="text-xs text-muted self-center">
          Upload uses current project/client filters when set
        </div>
        <button className="btn-primary" type="submit">Upload</button>
      </form>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {documents.map((d) => (
          <article key={d.id} className="card p-5 flex flex-col gap-3 border border-line">
            <div>
              <h2 className="font-semibold text-base leading-snug">{d.title}</h2>
              <p className="text-xs text-muted mt-1 truncate">{d.description || d.filename}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {d.project_id ? (
                <Link to={`/projects/${d.project_id}`} className="badge bg-blue-50 text-primary hover:underline">
                  {d.project_title || 'Project'}
                </Link>
              ) : (
                <span className="badge bg-slate-100 text-muted">No project</span>
              )}
              {d.client_id ? (
                <Link to={`/clients/${d.client_id}`} className="badge bg-emerald-50 text-success hover:underline">
                  {d.client_name}
                </Link>
              ) : (
                <span className="badge bg-slate-100 text-muted">No client</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="input text-xs"
                value={d.project_id || ''}
                onChange={(e) => relink(d.id, { projectId: e.target.value || null })}
              >
                <option value="">Link project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <select
                className="input text-xs"
                value={d.client_id || ''}
                onChange={(e) => relink(d.id, { clientId: e.target.value || null })}
              >
                <option value="">Link client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-auto flex items-center justify-between text-xs text-muted pt-2 border-t border-line">
              <span>{d.uploader_name || 'System'}</span>
              <a className="text-primary font-medium hover:underline" href={`/api/documents/${d.id}/download`}>
                Download
              </a>
            </div>
          </article>
        ))}
      </div>
      {!documents.length && (
        <div className="card p-10 text-center text-sm text-muted">No documents for these filters</div>
      )}
    </div>
  );
}
