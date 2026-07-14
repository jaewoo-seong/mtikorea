import { useEffect, useRef } from 'react';

function ToolbarButton({ label, onClick, title }) {
  return (
    <button
      type="button"
      title={title || label}
      className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

export default function RichComposer({
  mode = 'compose',
  initialHtml = '',
  to = '',
  cc = '',
  bcc = '',
  subject = '',
  onToChange,
  onCcChange,
  onBccChange,
  onSubjectChange,
  onSend,
  onCancel,
  sending = false,
  showBcc = false,
}) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && initialHtml !== undefined) {
      editorRef.current.innerHTML = initialHtml || '';
    }
  }, [initialHtml, mode]);

  function exec(cmd, value = null) {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }

  function handleSend(e) {
    e.preventDefault();
    const html = editorRef.current?.innerHTML || '';
    const text = editorRef.current?.innerText || '';
    onSend({ html, text });
  }

  return (
    <form onSubmit={handleSend} className="flex flex-col h-full min-h-0 border border-line rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
        <div className="text-sm font-semibold capitalize">{mode}</div>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Discard
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      <div className="px-4 py-2 space-y-2 border-b border-line text-sm">
        <label className="flex items-center gap-3">
          <span className="w-12 text-muted shrink-0">To</span>
          <input className="input border-0 shadow-none px-0" value={to} onChange={(e) => onToChange(e.target.value)} required placeholder="name@company.com" />
        </label>
        <label className="flex items-center gap-3">
          <span className="w-12 text-muted shrink-0">Cc</span>
          <input className="input border-0 shadow-none px-0" value={cc} onChange={(e) => onCcChange(e.target.value)} placeholder="optional" />
        </label>
        {showBcc && (
          <label className="flex items-center gap-3">
            <span className="w-12 text-muted shrink-0">Bcc</span>
            <input className="input border-0 shadow-none px-0" value={bcc} onChange={(e) => onBccChange(e.target.value)} placeholder="optional" />
          </label>
        )}
        <label className="flex items-center gap-3">
          <span className="w-12 text-muted shrink-0">Subject</span>
          <input className="input border-0 shadow-none px-0 font-medium" value={subject} onChange={(e) => onSubjectChange(e.target.value)} required />
        </label>
      </div>

      <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-line bg-slate-50/80">
        <ToolbarButton label="B" title="Bold" onClick={() => exec('bold')} />
        <ToolbarButton label="I" title="Italic" onClick={() => exec('italic')} />
        <ToolbarButton label="U" title="Underline" onClick={() => exec('underline')} />
        <span className="w-px h-4 bg-line mx-1" />
        <ToolbarButton label="• List" onClick={() => exec('insertUnorderedList')} />
        <ToolbarButton label="1. List" onClick={() => exec('insertOrderedList')} />
        <ToolbarButton
          label="Link"
          onClick={() => {
            const url = window.prompt('URL');
            if (url) exec('createLink', url);
          }}
        />
        <ToolbarButton label="Quote" onClick={() => exec('formatBlock', 'blockquote')} />
        <ToolbarButton label="Clear" onClick={() => exec('removeFormat')} />
      </div>

      <div
        ref={editorRef}
        className="flex-1 min-h-[220px] overflow-y-auto px-4 py-3 text-sm outline-none prose prose-sm max-w-none"
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder="Write your message…"
        suppressContentEditableWarning
      />
    </form>
  );
}
