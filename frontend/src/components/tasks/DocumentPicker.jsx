import { useEffect, useMemo, useState } from 'react';
import { IconSearch, IconX, IconFile, IconCheck } from '../../lib/icons';
import { formatBytes, formatDate } from '../../lib/taskMeta';

/**
 * Modal for attaching shared documents to a request.
 *
 * "Easy to find the uploaded documents" is the whole point here: the list is
 * searchable across title and filename, filterable by client, and sorted newest
 * first, so the document you just uploaded is the one at the top.
 */
export default function DocumentPicker({ documents, clients, alreadyAttachedIds = [], onCancel, onConfirm }) {
  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState('');
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return documents
      .filter((d) => !alreadyAttachedIds.includes(d.id))
      .filter((d) => !clientId || d.client_id === clientId)
      .filter(
        (d) =>
          !needle ||
          (d.title || '').toLowerCase().includes(needle) ||
          (d.filename || '').toLowerCase().includes(needle)
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [documents, alreadyAttachedIds, clientId, q]);

  function toggle(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onCancel} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-canvas border border-line-strong shadow-mid flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
          <h2 className="font-display text-lg font-semibold">Attach documents</h2>
          <button type="button" className="btn-ghost p-1.5" onClick={onCancel} aria-label="Close">
            <IconX width={16} height={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-line grid sm:grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <IconSearch
              width={14}
              height={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              className="input pl-8"
              autoFocus
              placeholder="Search by title or filename…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="input sm:w-52" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {results.map((d) => {
            const on = picked.includes(d.id);
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => toggle(d.id)}
                className={`w-full text-left px-5 py-2.5 flex items-center gap-3 border-b border-line ${
                  on ? 'bg-acc-100' : 'hover:bg-black/[0.03]'
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 shrink-0 border ${
                    on ? 'bg-primary border-primary text-canvas' : 'border-line-strong'
                  }`}
                >
                  {on && <IconCheck width={12} height={12} />}
                </span>
                <IconFile width={16} height={16} className="text-muted shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-ink">{d.title}</span>
                  <span className="block truncate text-xs text-muted">{d.filename}</span>
                </span>
                <span className="text-xs text-muted shrink-0 tabular-nums">
                  {formatBytes(d.size_bytes)} · {formatDate(d.created_at)}
                </span>
              </button>
            );
          })}
          {!results.length && (
            <p className="px-5 py-10 text-center text-sm text-muted">
              {q || clientId ? 'No documents match this search.' : 'No shared documents available yet.'}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line">
          <span className="text-xs text-muted">
            {picked.length ? `${picked.length} selected` : 'Select one or more documents'}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!picked.length}
              onClick={() => onConfirm(picked)}
            >
              Attach {picked.length || ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
