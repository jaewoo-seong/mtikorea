import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

const TABS = ['overview', 'markdown', 'documents', 'projects', 'tasks', 'audit'];

function Editable({ label, value, onSave, multiline, type = 'text' }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-muted uppercase tracking-wide">{label}</span>
      <Tag
        className={`input mt-1 ${multiline ? 'min-h-[100px] font-mono text-sm' : ''}`}
        type={multiline ? undefined : type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (String(draft) !== String(value ?? '')) onSave(draft);
        }}
      />
    </label>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');
  const [markdown, setMarkdown] = useState('');
  const [mdDirty, setMdDirty] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const toast = useToast();

  async function load() {
    const d = await api.clients.get(id);
    setData(d);
    setMarkdown(d.client.profile_markdown || '');
    setMdDirty(false);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);

  async function saveField(field, value) {
    try {
      await api.clients.update(id, { [field]: value });
      setMsg('Saved');
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveMarkdown() {
    try {
      await api.clients.update(id, { profile_markdown: markdown });
      setMdDirty(false);
      setMsg('Markdown saved');
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!data) return <div className="text-muted text-sm">{error || 'Loading…'}</div>;
  const { client, edits, documents, projects = [], tasks } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/clients" className="text-sm text-muted hover:text-primary">← Client database</Link>
          <h1 className="text-3xl mt-2">{client.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            <span className="badge-neutral capitalize">{client.status}</span>
            {client.industry && <span className="badge-accent">{client.industry}</span>}
            {client.email && <span className="badge-neutral">{client.email}</span>}
          </div>
        </div>
        {msg && <span className="text-xs text-success">{msg}</span>}
      </div>

      <div className="seg flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`seg-opt capitalize ${tab === t ? 'seg-opt-active' : ''}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card p-5 grid sm:grid-cols-2 gap-4">
            <Editable label="Name" value={client.name} onSave={(v) => saveField('name', v)} />
            <Editable label="Korean name" value={client.korean_name} onSave={(v) => saveField('korean_name', v)} />
            <Editable label="Email" value={client.email} onSave={(v) => saveField('email', v)} />
            <Editable label="Phone" value={client.phone} onSave={(v) => saveField('phone', v)} />
            <Editable label="Website" value={client.website} onSave={(v) => saveField('website', v)} />
            <Editable label="Industry" value={client.industry} onSave={(v) => saveField('industry', v)} />
            <label className="block text-sm">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
              <select
                className="input mt-1"
                value={client.status}
                onChange={(e) => saveField('status', e.target.value)}
              >
                {['prospect', 'lead', 'customer', 'inactive'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <Editable label="Short description" value={client.description} multiline onSave={(v) => saveField('description', v)} />
            </div>
            <div className="sm:col-span-2">
              <Editable label="Internal notes" value={client.notes} multiline onSave={(v) => saveField('notes', v)} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="card p-4">
              <div className="text-xs text-muted">Linked</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="border border-line bg-surface py-3"><div className="text-lg font-semibold">{documents.length}</div>docs</div>
                <div className="border border-line bg-surface py-3"><div className="text-lg font-semibold">{projects.length}</div>projects</div>
                <div className="border border-line bg-surface py-3"><div className="text-lg font-semibold">{tasks.length}</div>tasks</div>
              </div>
            </div>
            <div className="card p-4 text-sm space-y-2">
              <Link className="text-primary hover:underline block" to={`/documents?clientId=${id}`}>Open shared documents →</Link>
              <Link className="text-primary hover:underline block" to={`/projects`}>Browse projects →</Link>
              <Link className="text-primary hover:underline block" to={`/tasks?clientId=${id}`}>Open tasks →</Link>
            </div>
          </div>
        </div>
      )}

      {tab === 'markdown' && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Company markdown</h2>
              <p className="text-xs text-muted mt-0.5">Free-form profile notes, research, and structured write-ups. Autosave on Save.</p>
            </div>
            <button type="button" className="btn-primary" disabled={!mdDirty} onClick={saveMarkdown}>
              {mdDirty ? 'Save markdown' : 'Saved'}
            </button>
          </div>
          <textarea
            className="input min-h-[420px] font-mono text-sm leading-relaxed"
            value={markdown}
            onChange={(e) => { setMarkdown(e.target.value); setMdDirty(true); }}
            placeholder={"# Company briefing\n\n## Background\n\n## Contacts\n\n## Notes\n"}
          />
        </div>
      )}

      {tab === 'documents' && (
        <div className="grid md:grid-cols-2 gap-3">
          {documents.map((d) => (
            <a key={d.id} href={`/api/documents/${d.id}/download`} className="card p-4 hover:shadow-mid border border-line block">
              <div className="font-semibold text-sm">{d.title}</div>
              <div className="text-xs text-muted mt-1">ID / title: {d.title}</div>
              <div className="text-xs text-muted mt-2">{d.filename} · {d.source || 'upload'}</div>
            </a>
          ))}
          {!documents.length && <div className="card p-8 text-sm text-muted md:col-span-2 text-center">No approved shared documents linked yet</div>}
        </div>
      )}

      {tab === 'projects' && (
        <div className="grid md:grid-cols-2 gap-3">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card p-4 hover:shadow-mid border border-line block">
              <div className="flex justify-between gap-2">
                <div className="font-semibold">{p.title}</div>
                <span className="badge-neutral capitalize">{p.status}</span>
              </div>
              <div className="text-xs text-muted mt-2">{Math.round(p.progress_pct || 0)}% progress</div>
            </Link>
          ))}
          {!projects.length && <div className="card p-8 text-sm text-muted md:col-span-2 text-center">No projects linked to this client</div>}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="grid md:grid-cols-2 gap-3">
          {tasks.map((t) => (
            <div key={t.id} className="card p-4 border border-line">
              <div className="font-semibold text-sm">{t.title}</div>
              <div className="text-xs text-muted mt-1 capitalize">{t.status}</div>
              {t.document_title && (
                <div className="text-xs mt-2">Feedback on: <span className="text-primary">{t.document_title}</span></div>
              )}
            </div>
          ))}
          {!tasks.length && <div className="card p-8 text-sm text-muted md:col-span-2 text-center">No tasks</div>}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Edit history</h2>
          <ul className="space-y-2 text-xs max-h-[480px] overflow-y-auto">
            {edits.map((e) => (
              <li key={e.id} className="border-b border-line pb-2">
                <div className="font-medium">{e.field_name}</div>
                <div className="text-muted">{e.old_value || '∅'} → {e.new_value || '∅'}</div>
                <div className="text-muted">{e.editor_name || e.editor_email} · {new Date(e.edited_at).toLocaleString()}</div>
              </li>
            ))}
            {!edits.length && <li className="text-muted">No edits yet</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
