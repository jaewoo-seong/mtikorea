import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { IconAlert, IconCheck, IconLoader } from '../lib/icons';
import ConfirmButton from '../components/ConfirmButton';

const PROVIDER_LABELS = { openrouter: 'OpenRouter', nvidia: 'NVIDIA NIM (free tier)' };

function KeyStatusBadge({ status }) {
  if (status === 'healthy') {
    return (
      <span className="badge bg-emerald-100 text-success inline-flex items-center gap-1">
        <IconCheck width={11} height={11} /> Healthy
      </span>
    );
  }
  if (status === 'unhealthy') {
    return (
      <span className="badge bg-red-100 text-danger inline-flex items-center gap-1">
        <IconAlert width={11} height={11} /> Unhealthy
      </span>
    );
  }
  return <span className="badge-neutral">Untested</span>;
}

export default function AdminPage({ user }) {
  const [users, setUsers] = useState([]);
  const [newAccount, setNewAccount] = useState({ username: '', password: '', name: '' });
  const [msg, setMsg] = useState('');
  const [llmKeys, setLlmKeys] = useState([]);
  const [newKey, setNewKey] = useState({ provider: 'openrouter', label: '', apiKey: '', models: '' });
  const [savingKey, setSavingKey] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const toast = useToast();

  if (user.role !== 'admin') return <Navigate to="/clients" replace />;

  async function load() {
    const [d, k] = await Promise.all([api.admin.users(), api.admin.llmKeys.list()]);
    setUsers(d.users);
    setLlmKeys(k.keys);
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

  async function createLlmKey(e) {
    e.preventDefault();
    setSavingKey(true);
    try {
      const models = newKey.models.split(',').map((m) => m.trim()).filter(Boolean);
      const { key } = await api.admin.llmKeys.create({
        provider: newKey.provider,
        label: newKey.label.trim(),
        apiKey: newKey.apiKey.trim(),
        models,
      });
      toast[key.status === 'healthy' ? 'success' : 'error'](
        key.status === 'healthy' ? `"${key.label}" added — key works` : `"${key.label}" added but the key test failed: ${key.last_error || 'unknown error'}`
      );
      setNewKey({ provider: 'openrouter', label: '', apiKey: '', models: '' });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingKey(false);
    }
  }

  async function testLlmKey(id) {
    setTestingId(id);
    try {
      const { key } = await api.admin.llmKeys.test(id);
      toast[key.status === 'healthy' ? 'success' : 'error'](
        key.status === 'healthy' ? `"${key.label}" is healthy` : `"${key.label}" failed: ${key.last_error || 'unknown error'}`
      );
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTestingId(null);
    }
  }

  async function toggleLlmKeyActive(key) {
    try {
      await api.admin.llmKeys.update(key.id, { active: !key.active });
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function deleteLlmKey(id, label) {
    try {
      await api.admin.llmKeys.delete(id);
      toast.success(`Removed "${label}"`);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Admin</h1>
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

      <div className="card overflow-hidden p-0 gap-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-300 text-neutral-800 text-left border-b border-line-strong">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">User</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Role</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Active</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Password</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line odd:bg-black/[0.025]">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name || '—'}</div>
                  <div className="text-muted text-xs">
                    {u.username ? `@${u.username}` : u.email}
                    {u.has_password ? ' · password login' : ''}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="badge-neutral capitalize">{u.role}</span>
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
                <td className="px-4 py-3">
                  {u.username ? (
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={async () => {
                        const pw = window.prompt(`New password for @${u.username} (min 8 chars)`);
                        if (!pw) return;
                        if (pw.length < 8) {
                          toast.error('Password must be at least 8 characters');
                          return;
                        }
                        try {
                          await updateUser(u.id, { password: pw });
                          toast.success(`Password updated for @${u.username}`);
                        } catch (err) {
                          toast.error(err.message);
                        }
                      }}
                    >
                      {u.has_password ? 'Reset password' : 'Set password'}
                    </button>
                  ) : (
                    <span className="text-xs text-muted">
                      {u.oauth_provider === 'google' ? 'Google-only' : 'No password login'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-2xl">Model & API keys</h2>
        <p className="text-sm text-muted mt-1">
          <strong>Default:</strong> Railway/env <code className="text-xs">OPENROUTER_API_KEY</code> runs
          the main Haiku orchestrator (and env free-model fallback for subs).
          Keys below are <strong>extra sub-agent options</strong> — tested when you add them and again on-demand before sub-agent use (skipped for 1h after a healthy check or successful use). Unhealthy keys are skipped; env OpenRouter fallback rechecks every ~10 minutes while subs are active.
        </p>
      </div>

      <form onSubmit={createLlmKey} className="card p-4 grid md:grid-cols-2 gap-3">
        <select className="input" value={newKey.provider}
          onChange={(e) => setNewKey({ ...newKey, provider: e.target.value })}>
          <option value="openrouter">OpenRouter</option>
          <option value="nvidia">NVIDIA NIM (free tier)</option>
        </select>
        <input className="input" required placeholder="Label (e.g. OpenRouter key 2)"
          value={newKey.label}
          onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} />
        <input className="input md:col-span-2" required type="password" placeholder="API key"
          value={newKey.apiKey}
          onChange={(e) => setNewKey({ ...newKey, apiKey: e.target.value })} />
        <input className="input md:col-span-2" required
          placeholder="Models this key serves, comma-separated (e.g. meta/llama-3.1-8b-instruct, meta/llama-3.1-70b-instruct)"
          value={newKey.models}
          onChange={(e) => setNewKey({ ...newKey, models: e.target.value })} />
        <button className="btn-primary md:col-span-2 inline-flex items-center justify-center gap-2" type="submit" disabled={savingKey}>
          {savingKey && <IconLoader width={14} height={14} />}
          {savingKey ? 'Testing key…' : 'Add & test key'}
        </button>
      </form>

      <div className="card overflow-hidden p-0 gap-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-300 text-neutral-800 text-left border-b border-line-strong">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Label</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Provider</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Models</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {llmKeys.map((k) => (
              <tr key={k.id} className="border-t border-line align-top odd:bg-black/[0.025]">
                <td className="px-4 py-3">
                  <div className="font-medium">{k.label}</div>
                  <div className="text-muted text-xs font-mono">{k.api_key}</div>
                </td>
                <td className="px-4 py-3 text-xs">{PROVIDER_LABELS[k.provider] || k.provider}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {(k.models || []).map((m) => (
                      <span key={m} className="badge-neutral text-xs font-mono">{m}</span>
                    ))}
                    {!k.models?.length && <span className="text-xs text-muted">No models set</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <KeyStatusBadge status={k.status} />
                  {k.status === 'unhealthy' && k.last_error && (
                    <div className="text-xs text-danger mt-1 max-w-xs truncate" title={k.last_error}>
                      {k.last_error}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-xs py-1 inline-flex items-center gap-1"
                      disabled={testingId === k.id}
                      onClick={() => testLlmKey(k.id)}
                    >
                      {testingId === k.id && <IconLoader width={12} height={12} />}
                      Test
                    </button>
                    <button
                      type="button"
                      className={`text-xs py-1 ${k.active ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => toggleLlmKeyActive(k)}
                    >
                      {k.active ? 'Disable' : 'Enable'}
                    </button>
                    <ConfirmButton
                      onConfirm={() => deleteLlmKey(k.id, k.label)}
                      className="text-xs text-muted hover:text-danger px-1.5 py-0.5"
                    >
                      Delete
                    </ConfirmButton>
                  </div>
                </td>
              </tr>
            ))}
            {!llmKeys.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                  No keys yet — sub-agents fall back to the shared OPENROUTER_API_KEY env var.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
