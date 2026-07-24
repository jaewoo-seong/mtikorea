import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { IconMenu, IconX } from '../lib/icons';

const WORKSPACE_NAV = [
  { to: '/projects', label: 'Projects' },
  { to: '/documents', label: 'Documents' },
  { to: '/tasks', label: 'Tasks' },
];

function linkClass(isActive) {
  return `px-3 py-2 text-sm font-medium transition block border-l-2 ${
    isActive ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink hover:border-line'
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

function SectionHeader({ title, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-4 mb-1 w-full flex items-center justify-between px-3 py-1.5 hover:bg-black/[0.03] text-left"
      aria-expanded={open}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</span>
      <span className={`text-muted text-xs transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
    </button>
  );
}

export default function AppLayout({ user, onLogout }) {
  const location = useLocation();
  const workspaceActive =
    location.pathname.startsWith('/projects') ||
    location.pathname.startsWith('/documents') ||
    location.pathname.startsWith('/tasks');

  const [workspaceOpen, setWorkspaceOpen] = useCollapsed('mti_nav_workspace_open', true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (workspaceActive) setWorkspaceOpen(true);
  }, [workspaceActive, setWorkspaceOpen]);

  // Below lg, the sidebar is an off-canvas drawer — close it on every navigation.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Unread task-comment badge, polled so replies show up without a manual refresh.
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    function poll() {
      api.tasks
        .unread()
        .then((d) => {
          if (!cancelled) setUnreadCount(d.total || 0);
        })
        .catch(() => {});
    }
    poll();
    const t = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="min-h-screen flex">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-ink/30 z-40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      {!mobileNavOpen && (
        <button
          type="button"
          className="fixed top-3 left-3 z-40 lg:hidden bg-canvas border border-line p-2 text-ink"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
        >
          <IconMenu width={18} height={18} />
        </button>
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] shrink-0 border-r border-line bg-canvas px-4 py-5 flex flex-col transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 px-2 flex items-start justify-between">
          <div>
            <div className="font-display text-2xl font-semibold tracking-tight text-ink">MTI AI</div>
            <div className="text-xs text-muted mt-0.5">Clients · Projects · Agents</div>
          </div>
          <button
            type="button"
            className="lg:hidden text-muted hover:text-ink p-1"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <IconX width={18} height={18} />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
          <NavLink to="/clients" className={({ isActive }) => linkClass(isActive)}>
            Clients
          </NavLink>

          <SectionHeader
            title="Workspace"
            open={workspaceOpen}
            onToggle={() => setWorkspaceOpen((v) => !v)}
          />
          {workspaceOpen &&
            WORKSPACE_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => linkClass(isActive)}>
                <span className="flex items-center justify-between">
                  {item.label}
                  {item.to === '/tasks' && unreadCount > 0 && (
                    <span className="badge-accent text-[10px] px-1.5 py-0 leading-4 min-w-[1.25rem] text-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </span>
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
        <header className="h-14 border-b border-line flex items-center justify-between pl-16 pr-6 lg:px-6">
          <div className="text-sm text-muted hidden sm:block">Projects · Documents · Tasks</div>
          <div className="badge-accent ml-auto">Linked workspace</div>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
