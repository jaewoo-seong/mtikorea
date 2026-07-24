import { useEffect } from 'react';
import DocumentPreview from './DocumentPreview';
import ConfirmButton from './ConfirmButton';
import { IconChevronRight, IconX } from '../lib/icons';

/**
 * Fullscreen document preview with prev/next across a sibling list.
 * Stops at ends (no wrap). Esc closes. ←/→ and j/k navigate.
 */
export default function DocumentPreviewModal({
  document: doc,
  siblings = [],
  onClose,
  onNavigate,
  onDelete,
  deleting = false,
}) {
  const index = siblings.findIndex((d) => d.id === doc?.id);
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < siblings.length - 1;
  const kindLabel = (() => {
    const m = doc?.mime_type || '';
    if (m.startsWith('image/')) return 'Image';
    if (m === 'application/pdf') return 'PDF';
    if (m.startsWith('text/') || m === 'application/json') return 'Text';
    return 'File';
  })();
  const isTextish =
    doc?.mime_type?.startsWith('text/') ||
    doc?.mime_type === 'application/json' ||
    (doc?.mime_type || '').includes('markdown');

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'k') {
        e.preventDefault();
        if (hasPrev) onNavigate(siblings[index - 1].id);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'j') {
        e.preventDefault();
        if (hasNext) onNavigate(siblings[index + 1].id);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [doc?.id, hasPrev, hasNext, index, siblings, onClose, onNavigate]);

  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label={doc.title}>
      <header className="shrink-0 h-14 border-b border-line flex items-center gap-3 px-4">
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold truncate text-ink">{doc.title}</div>
          <div className="text-xs text-muted truncate">
            {kindLabel}
            {doc.filename ? ` · ${doc.filename}` : ''}
            {index >= 0 ? ` · ${index + 1} of ${siblings.length}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1 disabled:opacity-60"
            disabled={!hasPrev}
            onClick={() => hasPrev && onNavigate(siblings[index - 1].id)}
            title="Previous (←)"
          >
            <IconChevronRight width={14} height={14} className="rotate-180" />
            Prev
          </button>
          <button
            type="button"
            className="btn-secondary text-xs py-1.5 px-2 inline-flex items-center gap-1 disabled:opacity-60"
            disabled={!hasNext}
            onClick={() => hasNext && onNavigate(siblings[index + 1].id)}
            title="Next (→)"
          >
            Next
            <IconChevronRight width={14} height={14} />
          </button>
          <a className="btn-ghost text-xs py-1.5" href={`/api/documents/${doc.id}/download`}>
            Download
          </a>
          {isTextish && (
            <a className="btn-ghost text-xs py-1.5" href={`/api/documents/${doc.id}/export/docx`} download>
              Export Word
            </a>
          )}
          {onDelete && (
            <ConfirmButton
              onConfirm={() => onDelete(doc.id)}
              pending={deleting}
              className="btn-ghost text-xs py-1.5 text-danger"
              confirmClassName="btn-danger text-xs py-1.5"
            >
              Delete
            </ConfirmButton>
          )}
          <button type="button" className="btn-ghost p-2" onClick={onClose} aria-label="Close preview" title="Esc">
            <IconX width={18} height={18} />
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <DocumentPreview documentId={doc.id} fill />
      </div>
    </div>
  );
}
