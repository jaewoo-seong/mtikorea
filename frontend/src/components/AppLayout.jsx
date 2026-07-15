import { useEffect, useState } from 'react';
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

const WORKSPACE_NAV = [
  { to: '/projects', label: 'Projects' },
  { to: '/documents', label: 'Documents' },
  { to: '/tasks', label: 'Tasks' },
];

function linkClass(isActive) {
  return `rounded-lg px-3 py-2 text-sm font-medium transition block ${
    isActive ? 'bg-blue-50 text-primary' : 'text-muted hover:bg-slate-50 hover:text-ink'
  }`;
}

function useCollapsed(key, defaultOpen) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return defaultOpen;
      return v === '1';
    } catch {
      return defaultOpen;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [key, open]);
  return [open, setOpen];
}

function SectionHeader({ title, open, onToggle, hint }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-4 mb-1 w-full flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-slate-50 text-left"
      aria-expanded={open}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</span>
      <span className="flex items-center gap-2">
        {hint && !open && <span className="text-[10px] text-primary font-medium normal-case">{hint}</span>}
        <span className={`text-muted text-xs transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </span>
    </button>
  );
}

export default function AppLayout({ user, onLogout }) {
  const location = useLocation();
  const emailActive = location.pathname.startsWith('/email');
  const workspaceActive =
    location.pathname.startsWith('/projects') ||
    location.pathname.startsWith('/documents') ||
    location.pathname.startsWith('/tasks');

  // Default: email collapsed (parked), workspace open when on those routes
  const [emailOpen, setEmailOpen] = useCollapsed('mti_nav_email_open', false);
  const [workspaceOpen, setWorkspaceOpen] = useCollapsed('mti_nav_workspace_open', true);

  useEffect(() => {
    if (emailActive) setEmailOpen(true);
  }, [emailActive, setEmailOpen]);

  useEffect(() => {
    if (workspaceActive) setWorkspaceOpen(true);
  }, [workspaceActive, setWorkspaceOpen]);

  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-[260px] shrink-0 border-r border-line bg-white/80 backdrop-blur px-4 py-5 flex flex-col">
        <div className="mb-6 px-2">
          <div className="font-display text-2xl font-semibold tracking-tight text-ink">MTI</div>
          <div className="text-xs text-muted mt-0.5">CRM · Workspace · Agents</div>
        </div>

        <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
          <NavLink to="/clients" className={({ isActive }) => linkClass(isActive)}>
            Clients
          </NavLink>

          <SectionHeader
            title="Workspace"
            open={workspaceOpen}
            onToggle={() => setWorkspaceOpen((v) => !v)}
            hint={workspaceActive ? 'active' : null}
          />
          {workspaceOpen &&
            WORKSPACE_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => linkClass(isActive)}>
                {item.label}
              </NavLink>
            ))}

          <SectionHeader
            title="Email"
            open={emailOpen}
            onToggle={() => setEmailOpen((v) => !v)}
            hint={emailActive ? 'active' : 'paused'}
          />
          {emailOpen &&
            EMAIL_FOLDERS.map((item) => (
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
          <NavLink to="/settings" className={({ isActive }) => linkClass(isActive)}>
            Settings
          </NavLink>
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
            <div className="text-sm text-muted">Projects · Documents · Tasks</div>
            <div className="badge bg-blue-50 text-primary">Linked workspace</div>
          </header>
        )}
        <main className={emailActive ? '' : 'p-6'}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
