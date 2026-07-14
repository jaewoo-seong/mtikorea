import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [invite, setInvite] = useState({ email: '', name: '', role: 'member' });
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

  async function sendInvite(e) {
    e.preventDefault();
    const r = await api.admin.invite(invite);
    setMsg(r.note || 'Invited');
    setInvite({ email: '', name: '', role: 'member' });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Admin</h1>
        <p className="text-sm text-muted mt-1">User access and roles (Google OAuth sign-in)</p>
      </div>

      <form onSubmit={sendInvite} className="card p-4 grid md:grid-cols-4 gap-3">
        <input className="input" required type="email" placeholder="email@company.com"
          value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
        <input className="input" placeholder="Name" value={invite.name}
          onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
        <select className="input" value={invite.role}
          onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
          <option value="admin">admin</option>
          <option value="member">member</option>
          <option value="viewer">viewer</option>
        </select>
        <button className="btn-primary" type="submit">Invite user</button>
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
                  <div className="text-muted text-xs">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="input w-32"
                    value={u.role}
                    onChange={(e) => updateUser(u.id, { role: e.target.value })}
                  >
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="viewer">viewer</option>
                  </select>
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
