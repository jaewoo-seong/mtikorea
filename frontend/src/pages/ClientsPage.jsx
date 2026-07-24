import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const statuses = ['prospect', 'lead', 'customer', 'inactive'];

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({ name: '', email: '', industry: '', status: 'prospect' });
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const params = {};
    if (q) params.q = q;
    if (status) params.status = status;
    const data = await api.clients.list(params);
    setClients(data.clients);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function createClient(e) {
    e.preventDefault();
    setError('');
    try {
      const { client } = await api.clients.create(form);
      setForm({ name: '', email: '', industry: '', status: 'prospect' });
      setShowForm(false);
      navigate(`/clients/${client.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl">Client database</h1>
          <p className="text-sm text-muted mt-1">
            Full company table. Click a row for profile, markdown, documents, and linked projects.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input className="input w-48" placeholder="Search…" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()} />
          <select className="input w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" className="btn-secondary" onClick={load}>Filter</button>
          <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'Add client'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createClient} className="card p-4 grid md:grid-cols-5 gap-3">
          <input className="input" placeholder="Company name" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Industry" value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <select className="input" value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn-primary" type="submit">Create & open</button>
        </form>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="card overflow-hidden p-0 gap-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-surface text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wide">Company</th>
                <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wide">Korean name</th>
                <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wide">Industry</th>
                <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wide">Docs</th>
                <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wide">Projects</th>
                <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wide">Tasks</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-line hover:bg-acc-100/60 cursor-pointer"
                  onClick={() => navigate(`/clients/${c.id}`)}
                >
                  <td className="px-4 py-3 font-semibold text-primary">{c.name}</td>
                  <td className="px-4 py-3 text-muted">{c.korean_name || '—'}</td>
                  <td className="px-4 py-3 text-muted">{c.industry || '—'}</td>
                  <td className="px-4 py-3 text-muted">{c.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="badge-neutral capitalize">{c.status}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.document_count ?? 0}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.project_count ?? 0}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.task_count ?? 0}</td>
                </tr>
              ))}
              {!clients.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">No clients yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
