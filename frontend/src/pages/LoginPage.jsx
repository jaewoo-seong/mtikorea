import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function LoginPage({ onLogin }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authFlags, setAuthFlags] = useState({ enabled: false, googleEnabled: false });
  const [email, setEmail] = useState('admin@mti.local');
  const [password, setPassword] = useState('');

  useEffect(() => {
    api
      .devLoginStatus()
      .then(setAuthFlags)
      .catch(() => setAuthFlags({ enabled: false, googleEnabled: false }));
  }, []);

  async function onDevSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api.devLogin(email, password);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="font-display text-3xl font-semibold">MTI CRM</h1>
        <p className="text-muted text-sm mt-2 leading-relaxed">
          Email + client CRM with project agents that keep working after you close the browser.
        </p>

        <div className="mt-8 flex flex-col gap-6">
          {authFlags.googleEnabled && (
            <a className="btn-primary w-full" href="/auth/google">
              Continue with Google
            </a>
          )}

          {authFlags.enabled && (
            <form onSubmit={onDevSubmit} className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">
                Developer pass (no Google)
              </div>
              <input
                className="input"
                type="email"
                autoComplete="username"
                placeholder="admin@mti.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="Developer password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="submit" className="btn-secondary w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in with developer pass'}
              </button>
            </form>
          )}

          {!authFlags.enabled && !authFlags.googleEnabled && (
            <p className="text-sm text-danger">
              No auth configured. Set DEV_AUTH_EMAIL + DEV_AUTH_PASSWORD (or Google OAuth keys).
            </p>
          )}
        </div>

        {error && <p className="text-danger text-sm mt-4">{error}</p>}
      </div>
    </div>
  );
}
