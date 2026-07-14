import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../lib/api';

const nav = [
  { to: '/clients', label: 'Clients' },
  { to: '/email', label: 'Email' },
  { to: '/projects', label: 'Projects' },
  { to: '/documents', label: 'Shared docs' },
  { to: '/tasks', label: 'Tasks' },
];

export default function AppLayout({ user, onLogout }) {
  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-[260px] shrink-0 border-r border-line bg-white/80 backdrop-blur px-4 py-5 flex flex-col">
        <div className="mb-8 px-2">
          <div className="font-display text-2xl font-semibold tracking-tight text-ink">MTI</div>
          <div className="text-xs text-muted mt-0.5">CRM · Email · Agents</div>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-blue-50 text-primary' : 'text-muted hover:bg-slate-50 hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {user.role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-blue-50 text-primary' : 'text-muted hover:bg-slate-50 hover:text-ink'
                }`
              }
            >
              Admin
            </NavLink>
          )}
        </nav>
        <div className="mt-auto pt-6 border-t border-line">
          <div className="px-2 text-sm font-medium truncate">{user.name || user.email}</div>
          <div className="px-2 text-xs text-muted capitalize">{user.role}</div>
          <button type="button" className="btn-ghost mt-2 w-full justify-start" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="h-14 border-b border-line bg-white/70 backdrop-blur flex items-center justify-between px-6">
          <div className="text-sm text-muted">Shared org workspace</div>
          <div className="badge bg-blue-50 text-primary">Railway Postgres</div>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
