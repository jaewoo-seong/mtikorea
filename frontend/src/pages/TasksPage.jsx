import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', clientId: '' });
  const [msg, setMsg] = useState('');

  async function load() {
    const [t, c] = await Promise.all([api.tasks.list(), api.clients.list()]);
    setTasks(t.tasks);
    setClients(c.clients);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function create(e) {
    e.preventDefault();
    await api.tasks.create({
      title: form.title,
      description: form.description,
      clientId: form.clientId || null,
    });
    setForm({ title: '', description: '', clientId: '' });
    await load();
  }

  async function setStatus(id, status) {
    await api.tasks.update(id, { status });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Shared tasks</h1>
        <p className="text-sm text-muted mt-1">Human tasks shared across the org (not agent jobs)</p>
      </div>

      <form onSubmit={create} className="card p-4 grid md:grid-cols-4 gap-3">
        <input className="input" required placeholder="Task title" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input className="input" placeholder="Description" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <select className="input" value={form.clientId}
          onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
          <option value="">No client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn-primary" type="submit">Add task</button>
      </form>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="space-y-3">
        {tasks.map((t) => (
          <div key={t.id} className="card p-4 flex items-start justify-between gap-4">
            <div>
              <div className="font-medium">{t.title}</div>
              <div className="text-sm text-muted mt-1">{t.description}</div>
              <div className="text-xs text-muted mt-2">
                {t.client_name || 'No client'} · {t.assignee_name || 'Unassigned'}
              </div>
            </div>
            <select
              className="input w-36"
              value={t.status}
              onChange={(e) => setStatus(t.id, e.target.value)}
            >
              <option value="open">open</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
