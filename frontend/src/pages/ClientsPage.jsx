import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const statuses = ['prospect', 'lead', 'customer', 'inactive'];

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({ name: '', email: '', industry: '', status: 'prospect' });
  const [error, setError] = useState('');

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
      await api.clients.create(form);
      setForm({ name: '', email: '', industry: '', status: 'prospect' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">Clients</h1>
          <p className="text-sm text-muted mt-1">Editable client database with audit trail</p>
        </div>
        <div className="flex gap-2">
          <input className="input w-48" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={() => load()}>Filter</button>
        </div>
      </div>

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
        <button className="btn-primary" type="submit">Add client</button>
      </form>

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-muted text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-line hover:bg-slate-50/80">
                <td className="px-4 py-3">
                  <Link className="text-primary font-medium hover:underline" to={`/clients/${c.id}`}>{c.name}</Link>
                </td>
                <td className="px-4 py-3 text-muted">{c.email || '—'}</td>
                <td className="px-4 py-3 text-muted">{c.industry || '—'}</td>
                <td className="px-4 py-3">
                  <span className="badge bg-slate-100 text-ink capitalize">{c.status}</span>
                </td>
              </tr>
            ))}
            {!clients.length && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No clients yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
