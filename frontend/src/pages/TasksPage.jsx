import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

function statusStyle(status) {
  if (status === 'done') return 'bg-emerald-100 text-success';
  if (status === 'in_progress') return 'bg-blue-100 text-primary';
  if (status === 'cancelled') return 'bg-slate-100 text-muted';
  return 'bg-amber-50 text-amber-800';
}

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
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
    const next = {};
    if (clientId) next.clientId = clientId;
    if (projectId) next.projectId = projectId;
    setSearchParams(next, { replace: true });
    load().catch((e) => setMsg(e.message));
  }, [clientId, projectId]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Tasks</h1>
        <p className="text-sm text-muted mt-1">
          Internal feedback loops — assign a teammate, attach a shared document, request review.
        </p>
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

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {tasks.map((t) => (
          <article key={t.id} className="card p-5 border border-line flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold leading-snug">{t.title}</h2>
              <span className={`badge capitalize shrink-0 ${statusStyle(t.status)}`}>{t.status.replace('_', ' ')}</span>
            </div>
            <p className="text-sm text-muted line-clamp-3">{t.description || 'No description'}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {t.feedback_requested && <span className="badge bg-violet-50 text-violet-700">Feedback</span>}
              {t.assignee_name && <span className="badge bg-slate-100">→ {t.assignee_name}</span>}
              {t.document_title && (
                <a className="badge bg-blue-50 text-primary hover:underline" href={`/api/documents/${t.document_id}/download`}>
                  📎 {t.document_title}
                </a>
              )}
              {t.project_id && (
                <Link to={`/projects/${t.project_id}`} className="badge bg-blue-50 text-primary hover:underline">
                  {t.project_title || 'Project'}
                </Link>
              )}
              {t.client_id && (
                <Link to={`/clients/${t.client_id}`} className="badge bg-emerald-50 text-success hover:underline">
                  {t.client_name}
                </Link>
              )}
            </div>
            <select className="input text-xs mt-auto" value={t.status}
              onChange={(e) => patch(t.id, { status: e.target.value })}>
              <option value="open">open</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
              <option value="cancelled">cancelled</option>
            </select>
          </article>
        ))}
      </div>
      {!tasks.length && (
        <div className="card p-10 text-center text-sm text-muted">No tasks for these filters</div>
      )}
    </div>
  );
}
