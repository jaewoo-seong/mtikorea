import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './lib/api';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import EmailPage from './pages/EmailPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import DocumentsPage from './pages/DocumentsPage';
import TasksPage from './pages/TasksPage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api
      .me()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  // Any API call that 401s mid-session drops us back to the login screen.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, []);

  if (user === undefined) {
    return (
      <div className="min-h-screen grid place-items-center text-muted text-sm">Loading…</div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={setUser} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout user={user} onLogout={() => setUser(null)} />}>
        <Route index element={<Navigate to="/clients" replace />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/email" element={<Navigate to="/email/inbox" replace />} />
        <Route path="/email/:folder" element={<EmailPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/admin" element={<AdminPage user={user} />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/clients" replace />} />
    </Routes>
  );
}
