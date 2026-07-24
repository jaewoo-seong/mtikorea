import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TurndownService from 'turndown';
import { IconX } from '../lib/icons';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

function ToolbarButton({ active, disabled, onClick, children, title }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`px-2 py-1 text-xs font-medium border border-transparent disabled:opacity-40 ${
        active ? 'bg-acc-100 text-primary border-line' : 'hover:bg-black/[0.04] text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Fullscreen WYSIWYG compose → markdown via compose API.
 */
export default function DocumentComposeModal({ onClose, onSave, saving = false }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'doc-compose-editor focus:outline-none min-h-[60vh] px-10 py-8 text-[15px] leading-relaxed text-ink',
      },
    },
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required');
      return;
    }
    if (!editor) return;
    setError(null);
    const html = editor.getHTML();
    const markdown = turndown.turndown(html === '<p></p>' ? '' : html);
    await onSave({ title: trimmed, content: markdown });
  }

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('Link URL', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label="New document">
      <header className="shrink-0 border-b border-line flex items-center gap-3 px-4 py-3">
        <input
          className="input flex-1 min-w-0 font-display font-semibold text-base border-0 bg-transparent shadow-none px-0 focus:ring-0"
          placeholder="Document title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <button type="button" className="btn-primary text-sm" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-ghost p-2" onClick={onClose} aria-label="Close" title="Esc">
          <IconX width={18} height={18} />
        </button>
      </header>

      {editor && (
        <div className="shrink-0 border-b border-line bg-surface px-3 py-1.5 flex flex-wrap items-center gap-0.5">
          <ToolbarButton
            title="Bold"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            title="Italic"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </ToolbarButton>
          <span className="w-px h-4 bg-line mx-1" />
          <ToolbarButton
            title="Heading 1"
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            title="Heading 2"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            title="Heading 3"
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </ToolbarButton>
          <span className="w-px h-4 bg-line mx-1" />
          <ToolbarButton
            title="Bullet list"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • List
          </ToolbarButton>
          <ToolbarButton
            title="Numbered list"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. List
          </ToolbarButton>
          <ToolbarButton title="Link" active={editor.isActive('link')} onClick={setLink}>
            Link
          </ToolbarButton>
          <span className="w-px h-4 bg-line mx-1" />
          <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()}>
            Undo
          </ToolbarButton>
          <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()}>
            Redo
          </ToolbarButton>
        </div>
      )}

      {error && <div className="px-4 py-2 text-sm text-danger bg-red-50 border-b border-line">{error}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-100/80 px-4 py-6">
        <div className="max-w-3xl mx-auto bg-white border border-line shadow-sm min-h-[70vh]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
