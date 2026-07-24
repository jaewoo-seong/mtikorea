import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconX } from '../../lib/icons';
import { handleOf, initialsOf } from '../../lib/taskMeta';

export function Avatar({ name, size = 24, title }) {
  return (
    <span
      title={title || name}
      className="inline-flex items-center justify-center shrink-0 bg-acc-200 text-acc-900 font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Multi-select people picker. Renders as selected chips plus a searchable
 * dropdown — the old page used a bare <select>, which caps you at one person
 * and hides everyone behind a native menu.
 */
export default function PeoplePicker({
  users,
  selectedIds,
  onChange,
  placeholder = 'Search teammates…',
  excludeIds = [],
  autoFocus = false,
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selected = useMemo(
    () => selectedIds.map((id) => users.find((u) => u.id === id)).filter(Boolean),
    [selectedIds, users]
  );

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => !selectedIds.includes(u.id) && !excludeIds.includes(u.id))
      .filter(
        (u) =>
          !needle ||
          (u.name || '').toLowerCase().includes(needle) ||
          (u.email || '').toLowerCase().includes(needle) ||
          handleOf(u).includes(needle)
      )
      .slice(0, 8);
  }, [users, selectedIds, excludeIds, q]);

  function add(user) {
    onChange([...selectedIds, user.id]);
    setQ('');
  }

  return (
    <div className="relative" ref={boxRef}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {selected.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1.5 bg-surface border border-line-strong pl-1 pr-1.5 py-0.5 text-xs"
            >
              <Avatar name={u.name || u.email} size={18} />
              <span className="text-ink">{u.name || u.email}</span>
              <button
                type="button"
                className="text-muted hover:text-danger"
                onClick={() => onChange(selectedIds.filter((id) => id !== u.id))}
                aria-label={`Remove ${u.name || u.email}`}
              >
                <IconX width={12} height={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <IconSearch
          width={14}
          height={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          className="input pl-8"
          value={q}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-canvas border border-line-strong shadow-mid max-h-56 overflow-y-auto">
          {matches.map((u) => (
            <button
              type="button"
              key={u.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-acc-100 flex items-center gap-2"
              onClick={() => add(u)}
            >
              <Avatar name={u.name || u.email} size={22} />
              <span className="flex-1 min-w-0 truncate text-ink">{u.name || u.email}</span>
              <span className="text-xs text-muted font-mono shrink-0">@{handleOf(u)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
