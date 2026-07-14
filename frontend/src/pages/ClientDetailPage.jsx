import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function ClientDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const d = await api.clients.get(id);
    setData(d);
    setDraft(d.client);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);

  async function saveField(field, value) {
    try {
      await api.clients.update(id, { [field]: value });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addNote(e) {
    e.preventDefault();
    await api.clients.addNote(id, note);
    setNote('');
    await load();
  }

  if (!data) return <div className="text-muted text-sm">{error || 'Loading…'}</div>;
  const { client, edits, notes, documents, emails, tasks } = data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/clients" className="text-sm text-muted hover:text-primary">← Clients</Link>
        <h1 className="font-display text-3xl font-semibold mt-2">{client.name}</h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 space-y-3">
            <h2 className="font-medium">Profile</h2>
            {['name', 'korean_name', 'email', 'phone', 'website', 'industry', 'status', 'description', 'notes'].map((field) => (
              <label key={field} className="block text-sm">
                <span className="text-muted capitalize">{field.replace('_', ' ')}</span>
                {field === 'description' || field === 'notes' ? (
                  <textarea
                    className="input mt-1 min-h-[80px]"
                    value={draft[field] || ''}
                    onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                    onBlur={(e) => {
                      if (e.target.value !== (client[field] || '')) saveField(field, e.target.value);
                    }}
                  />
                ) : (
                  <input
                    className="input mt-1"
                    value={draft[field] || ''}
                    onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                    onBlur={(e) => {
                      if (e.target.value !== (client[field] || '')) saveField(field, e.target.value);
                    }}
                  />
                )}
              </label>
            ))}
          </div>

          <div className="card p-5">
            <h2 className="font-medium mb-3">Shared notes</h2>
            <form onSubmit={addNote} className="flex gap-2 mb-4">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add shared description/note" />
              <button className="btn-primary" type="submit">Add</button>
            </form>
            <ul className="space-y-2 text-sm">
              {notes.map((n) => (
                <li key={n.id} className="border border-line rounded-lg p-3">
                  <div className="text-muted text-xs mb-1">{n.author_name || 'User'} · {new Date(n.created_at).toLocaleString()}</div>
                  {n.body}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-medium mb-3">Audit trail</h2>
            <ul className="space-y-2 text-xs">
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
          <div className="card p-5 text-sm space-y-2">
            <h2 className="font-medium">Linked</h2>
            <div>Emails: {emails.length}</div>
            <div>Documents: {documents.length}</div>
            <div>Tasks: {tasks.length}</div>
          </div>
        </div>
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}
