import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [newAccount, setNewAccount] = useState({ username: '', password: '', name: '' });
  const [msg, setMsg] = useState('');

  if (user.role !== 'admin') return <Navigate to="/clients" replace />;

  async function load() {
    const d = await api.admin.users();
    setUsers(d.users);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function updateUser(id, body) {
    await api.admin.updateUser(id, body);
    await load();
  }

  async function createAccount(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api.admin.createAccount(newAccount);
      setMsg(`Account "${newAccount.username}" created`);
      setNewAccount({ username: '', password: '', name: '' });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Admin</h1>
        <p className="text-sm text-muted mt-1">Create and manage local staff accounts</p>
      </div>

      <form onSubmit={createAccount} className="card p-4 grid md:grid-cols-4 gap-3">
        <input className="input" required placeholder="Username"
          value={newAccount.username}
          onChange={(e) => setNewAccount({ ...newAccount, username: e.target.value })} />
        <input className="input" required type="password" placeholder="Password (min 8 chars)"
          value={newAccount.password}
          onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })} />
        <input className="input" placeholder="Display name" value={newAccount.name}
          onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} />
        <button className="btn-primary" type="submit">Create account</button>
      </form>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-muted text-left">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name || '—'}</div>
                  <div className="text-muted text-xs">
                    {u.username ? `@${u.username}` : u.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-block rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-muted">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className={u.active ? 'btn-secondary' : 'btn-primary'}
                    onClick={() => updateUser(u.id, { active: !u.active })}
                  >
                    {u.active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
