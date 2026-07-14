import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ title: '', goal: '', clientId: '', tokenBudget: 50000 });
  const [error, setError] = useState('');

  async function load() {
    const [p, c] = await Promise.all([api.projects.list(), api.clients.list()]);
    setProjects(p.projects);
    setClients(c.clients);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function create(e) {
    e.preventDefault();
    await api.projects.create({
      title: form.title,
      goal: form.goal,
      clientId: form.clientId || null,
      tokenBudget: Number(form.tokenBudget) || 50000,
    });
    setForm({ title: '', goal: '', clientId: '', tokenBudget: 50000 });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Projects</h1>
        <p className="text-sm text-muted mt-1">
          Upload context, press Start — worker agents run until Stop (even if browser closed). No tokens until Start.
        </p>
      </div>

      <form onSubmit={create} className="card p-4 grid md:grid-cols-2 gap-3">
        <input className="input" placeholder="Project title" required value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select className="input" value={form.clientId}
          onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
          <option value="">No client link</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <textarea className="input md:col-span-2 min-h-[80px]" placeholder="Goal / brief"
          value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
        <input className="input" type="number" value={form.tokenBudget}
          onChange={(e) => setForm({ ...form, tokenBudget: e.target.value })} />
        <button className="btn-primary" type="submit">Create draft project</button>
      </form>

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        {projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="card p-5 hover:shadow-mid transition block">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium">{p.title}</h2>
              <span className={`badge capitalize ${
                p.status === 'running' ? 'bg-blue-100 text-primary' :
                p.status === 'completed' ? 'bg-emerald-100 text-success' :
                p.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-muted'
              }`}>{p.status}</span>
            </div>
            <p className="text-sm text-muted mt-2 line-clamp-2">{p.goal || 'No goal'}</p>
            <div className="text-xs text-muted mt-3 font-mono">
              tokens {p.tokens_used}/{p.token_budget} · logs {p.log_count}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
