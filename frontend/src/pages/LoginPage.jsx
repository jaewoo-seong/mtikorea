import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function LoginPage({ onLogin }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [bypassEnabled, setBypassEnabled] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);

  useEffect(() => {
    api.devLoginStatus().then((s) => setBypassEnabled(Boolean(s.bypassEnabled))).catch(() => {});
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api.login(username, password);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onDevBypass() {
    setBypassLoading(true);
    setError('');
    try {
      const data = await api.devBypass();
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBypassLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="font-display text-3xl font-semibold">MTI AI</h1>
        <p className="text-muted text-sm mt-2 leading-relaxed">
          Client CRM with project agents that keep working after you close the browser.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-3">
          <input
            className="input"
            type="text"
            autoComplete="username"
            placeholder="Username or email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {error && <p className="text-danger text-sm mt-4">{error}</p>}

        {bypassEnabled && (
          <div className="mt-6 pt-6 border-t border-line">
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={onDevBypass}
              disabled={bypassLoading}
            >
              {bypassLoading ? 'Signing in…' : 'Developer login (no credentials)'}
            </button>
            <p className="text-muted text-xs mt-2 text-center">
              Local testing only — disabled automatically in production.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
