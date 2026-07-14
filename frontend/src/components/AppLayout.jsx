import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';

const EMAIL_FOLDERS = [
  { to: '/email/inbox', label: 'Inbox' },
  { to: '/email/starred', label: 'Starred' },
  { to: '/email/important', label: 'Important' },
  { to: '/email/sent', label: 'Sent' },
  { to: '/email/drafts', label: 'Drafts' },
  { to: '/email/spam', label: 'Spam' },
  { to: '/email/trash', label: 'Trash' },
  { to: '/email/all', label: 'All mail' },
];

const primaryNav = [
  { to: '/clients', label: 'Clients' },
  { to: '/projects', label: 'Projects' },
  { to: '/documents', label: 'Shared docs' },
  { to: '/tasks', label: 'Tasks' },
];

function linkClass(isActive) {
  return `rounded-lg px-3 py-2 text-sm font-medium transition block ${
    isActive ? 'bg-blue-50 text-primary' : 'text-muted hover:bg-slate-50 hover:text-ink'
  }`;
}

export default function AppLayout({ user, onLogout }) {
  const location = useLocation();
  const emailActive = location.pathname.startsWith('/email');

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

        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          <NavLink to="/clients" className={({ isActive }) => linkClass(isActive)}>
            Clients
          </NavLink>

          <div className="mt-3 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Email
          </div>
          {EMAIL_FOLDERS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm transition block ${
                  isActive ? 'bg-blue-50 text-primary font-medium' : 'text-muted hover:bg-slate-50 hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {!emailActive && (
            <NavLink to="/email/inbox" className="px-3 py-1 text-xs text-primary hover:underline">
              Open mail
            </NavLink>
          )}

          <div className="mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Workspace
          </div>
          {primaryNav
            .filter((n) => n.to !== '/clients')
            .map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => linkClass(isActive)}>
                {item.label}
              </NavLink>
            ))}

          {user.role === 'admin' && (
            <>
              <div className="mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Admin
              </div>
              <NavLink to="/admin" className={({ isActive }) => linkClass(isActive)}>
                Users & access
              </NavLink>
            </>
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
        {!emailActive && (
          <header className="h-14 border-b border-line bg-white/70 backdrop-blur flex items-center justify-between px-6">
            <div className="text-sm text-muted">Shared org workspace</div>
            <div className="badge bg-blue-50 text-primary">Railway Postgres</div>
          </header>
        )}
        <main className={emailActive ? '' : 'p-6'}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
