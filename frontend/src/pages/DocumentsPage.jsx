import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import DocumentPreviewModal from '../components/DocumentPreviewModal';
import DocumentComposeModal from '../components/DocumentComposeModal';
import ConfirmButton from '../components/ConfirmButton';
import BlueprintCorners from '../components/BlueprintCorners';
import { useToast } from '../components/Toast';
import { IconSearch } from '../lib/icons';

function buildFolderTree(folders) {
  const byParent = new Map();
  for (const f of folders) {
    const key = f.parent_id || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(f);
  }
  function attach(parentKey) {
    return (byParent.get(parentKey) || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({ ...f, children: attach(f.id) }));
  }
  return attach('root');
}

function FolderRow({ folder, depth, selectedId, onSelect, onRename, onDelete, onAddChild, onDropDoc }) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const [dragOver, setDragOver] = useState(false);
  const hasChildren = folder.children.length > 0;

  function commitRename() {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== folder.name) onRename(folder.id, trimmed);
    else setName(folder.name);
  }

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-1.5 py-1 text-sm cursor-pointer ${
          dragOver
            ? 'bg-acc-100 outline outline-1 outline-primary'
            : selectedId === folder.id
              ? 'bg-acc-100 text-primary'
              : 'hover:bg-black/[0.03]'
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        onClick={() => !editing && onSelect(folder.id)}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const docId = e.dataTransfer.getData('text/plain');
          if (docId) onDropDoc(docId, folder.id);
        }}
      >
        <button
          type="button"
          className="w-4 shrink-0 text-muted"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : ''}
        </button>
        {editing ? (
          <input
            autoFocus
            className="input text-xs py-0.5 px-1 flex-1 min-w-0"
            value={name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setName(folder.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            className="truncate flex-1 min-w-0"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            {folder.name}
          </span>
        )}
        <span className="text-[11px] text-muted shrink-0">{folder.document_count}</span>
        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="New subfolder"
            className="text-muted hover:text-primary px-1"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(folder.id);
            }}
          >
            +
          </button>
          <ConfirmButton onConfirm={() => onDelete(folder.id)} className="text-muted hover:text-danger px-1">
            ×
          </ConfirmButton>
        </div>
      </div>
      {expanded && hasChildren && (
        <div>
          {folder.children.map((c) => (
            <FolderRow
              key={c.id}
              folder={c}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onDropDoc={onDropDoc}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function fileKind(mimeType) {
  if (!mimeType) return { label: 'File', tone: 'badge-neutral' };
  if (mimeType.startsWith('image/')) return { label: 'Image', tone: 'badge-accent2' };
  if (mimeType === 'application/pdf') return { label: 'PDF', tone: 'badge bg-red-50 text-danger' };
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return { label: 'Text', tone: 'badge bg-emerald-50 text-success' };
  }
  if (mimeType.includes('word') || mimeType.includes('document')) {
    return { label: 'Doc', tone: 'badge-accent' };
  }
  if (mimeType.includes('sheet') || mimeType.includes('excel')) {
    return { label: 'Sheet', tone: 'badge-outline' };
  }
  return { label: 'File', tone: 'badge-neutral' };
}

function isTextish(mimeType) {
  return (
    mimeType?.startsWith('text/') ||
    mimeType === 'application/json' ||
    (mimeType || '').includes('markdown')
  );
}

export default function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState(null);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderFilter, setFolderFilter] = useState('all');
  const [unfiledDragOver, setUnfiledDragOver] = useState(false);
  const [clientId, setClientId] = useState(searchParams.get('clientId') || '');
  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '');
  const [searchQ, setSearchQ] = useState(searchParams.get('q') || '');
  const [debouncedQ, setDebouncedQ] = useState(searchQ);
  const [selectedId, setSelectedId] = useState(null);
  const [previewId, setPreviewId] = useState(searchParams.get('preview') || null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSaving, setComposeSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [storageUsage, setStorageUsage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragMovedRef = useRef(false);
  const toast = useToast();

  const folderTree = buildFolderTree(folders);
  const flatFolderOptions = [];
  (function flatten(nodes, depth) {
    for (const f of nodes) {
      flatFolderOptions.push({ id: f.id, label: `${'— '.repeat(depth)}${f.name}` });
      flatten(f.children, depth + 1);
    }
  })(folderTree, 0);

  const docs = documents || [];
  const selected = docs.find((d) => d.id === selectedId) || null;
  const previewDoc = docs.find((d) => d.id === previewId) || null;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQ]);

  const syncParams = useCallback(
    (overrides = {}) => {
      const next = {};
      const c = 'clientId' in overrides ? overrides.clientId : clientId;
      const p = 'projectId' in overrides ? overrides.projectId : projectId;
      const q = 'q' in overrides ? overrides.q : debouncedQ;
      const prev = 'preview' in overrides ? overrides.preview : previewId;
      if (c) next.clientId = c;
      if (p) next.projectId = p;
      if (q) next.q = q;
      if (prev) next.preview = prev;
      setSearchParams(next, { replace: true });
    },
    [clientId, projectId, debouncedQ, previewId, setSearchParams]
  );

  async function loadFolders() {
    const { folders: rows } = await api.documentFolders.list();
    setFolders(rows);
  }

  async function createFolder(parentId) {
    const name = window.prompt('Folder name');
    if (!name?.trim()) return;
    try {
      await api.documentFolders.create({ name: name.trim(), parentId: parentId || null });
      await loadFolders();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function renameFolder(folderId, name) {
    try {
      await api.documentFolders.update(folderId, { name });
      await loadFolders();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function deleteFolder(folderId) {
    try {
      await api.documentFolders.delete(folderId);
      if (folderFilter === folderId) setFolderFilter('all');
      toast.success('Folder deleted — any documents inside are now unfiled');
      await Promise.all([loadFolders(), load()]);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function load() {
    const [d, c, p] = await Promise.all([
      api.documents.list({
        clientId: clientId || undefined,
        projectId: projectId || undefined,
        folderId: folderFilter === 'all' ? undefined : folderFilter,
        q: debouncedQ || undefined,
      }),
      api.clients.list(),
      api.projects.list(),
    ]);
    setDocuments(d.documents);
    setClients(c.clients);
    setProjects(p.projects);
  }

  async function loadStorageUsage() {
    setStorageUsage(await api.documents.storageUsage());
  }

  useEffect(() => {
    loadFolders().catch((e) => toast.error(e.message));
    loadStorageUsage().catch(() => {});
  }, []);

  useEffect(() => {
    syncParams();
    load().catch((e) => toast.error(e.message));
  }, [clientId, projectId, folderFilter, debouncedQ]);

  useEffect(() => {
    if (!documents) return;
    if (selectedId && !documents.some((d) => d.id === selectedId)) {
      setSelectedId(null);
    }
    if (previewId && !documents.some((d) => d.id === previewId)) {
      if (documents.length || documents !== null) {
        setPreviewId(null);
        syncParams({ preview: null });
      }
    }
  }, [documents]);

  function openPreview(docId) {
    setSelectedId(docId);
    setPreviewId(docId);
    syncParams({ preview: docId });
  }

  function closePreview() {
    setPreviewId(null);
    syncParams({ preview: null });
  }

  function navigatePreview(docId) {
    setSelectedId(docId);
    setPreviewId(docId);
    syncParams({ preview: docId });
  }

  function onListKeyDown(e) {
    if (!docs.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = docs.findIndex((d) => d.id === selectedId);
      let next = idx;
      if (e.key === 'ArrowDown') next = Math.min(docs.length - 1, Math.max(0, idx + 1));
      if (e.key === 'ArrowUp') next = Math.max(0, idx < 0 ? 0 : idx - 1);
      setSelectedId(docs[next].id);
      return;
    }
    if (e.key === 'Enter' && selectedId) {
      e.preventDefault();
      openPreview(selectedId);
    }
  }

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const { document: uploaded } = await api.documents.upload(file, {
        title: file.name,
        clientId: clientId || undefined,
        projectId: projectId || undefined,
      });
      if (uploaded?.id && folderFilter !== 'all' && folderFilter !== 'root') {
        await api.documents.update(uploaded.id, { folderId: folderFilter });
      }
      toast.success('Uploaded');
      await Promise.all([load(), loadStorageUsage(), loadFolders()]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function saveCompose({ title, content }) {
    setComposeSaving(true);
    try {
      await api.documents.compose({
        title,
        content,
        clientId: clientId || undefined,
        projectId: projectId || undefined,
        folderId: folderFilter !== 'all' && folderFilter !== 'root' ? folderFilter : undefined,
      });
      toast.success('Document created');
      setComposeOpen(false);
      await Promise.all([load(), loadStorageUsage(), loadFolders()]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setComposeSaving(false);
    }
  }

  async function deleteDocument(docId) {
    setDeleting(true);
    try {
      await api.documents.delete(docId);
      toast.success('Document deleted');
      if (previewId === docId) closePreview();
      if (selectedId === docId) setSelectedId(null);
      await Promise.all([load(), loadStorageUsage(), loadFolders()]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  async function relink(docId, fields) {
    try {
      await api.documents.update(docId, fields);
      await load();
      if ('folderId' in fields) await loadFolders();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function dropDocOnFolder(docId, folderId) {
    const doc = documents?.find((d) => d.id === docId);
    try {
      await api.documents.update(docId, { folderId });
      toast.success(`Moved "${doc?.title || 'document'}" to ${folderId ? 'folder' : 'Unfiled'}`);
      await Promise.all([load(), loadFolders()]);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const folderPanel = (
    <div className="card blueprint p-3 min-w-0 h-full">
      <BlueprintCorners />
      <div className="flex items-center justify-between px-1.5 mb-1">
        <span className="card-kicker">Folders</span>
        <button
          type="button"
          title="New folder"
          className="btn-ghost text-xs px-1"
          onClick={() => createFolder(folderFilter !== 'all' && folderFilter !== 'root' ? folderFilter : null)}
        >
          + New
        </button>
      </div>
      <div
        className={`px-1.5 py-1 text-sm cursor-pointer ${
          folderFilter === 'all' ? 'bg-acc-100 text-primary' : 'hover:bg-black/[0.03]'
        }`}
        onClick={() => {
          setFolderFilter('all');
          setFoldersOpen(false);
        }}
      >
        All documents
      </div>
      <div
        className={`px-1.5 py-1 text-sm cursor-pointer ${
          unfiledDragOver
            ? 'bg-acc-100 outline outline-1 outline-primary'
            : folderFilter === 'root'
              ? 'bg-acc-100 text-primary'
              : 'hover:bg-black/[0.03]'
        }`}
        onClick={() => {
          setFolderFilter('root');
          setFoldersOpen(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={(e) => {
          e.preventDefault();
          setUnfiledDragOver(true);
        }}
        onDragLeave={() => setUnfiledDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setUnfiledDragOver(false);
          const docId = e.dataTransfer.getData('text/plain');
          if (docId) dropDocOnFolder(docId, null);
        }}
      >
        Unfiled
      </div>
      <div className="mt-1">
        {folderTree.map((f) => (
          <FolderRow
            key={f.id}
            folder={f}
            depth={0}
            selectedId={folderFilter}
            onSelect={(id) => {
              setFolderFilter(id);
              setFoldersOpen(false);
            }}
            onRename={renameFolder}
            onDelete={deleteFolder}
            onAddChild={createFolder}
            onDropDoc={dropDocOnFolder}
          />
        ))}
      </div>
      {!folders.length && (
        <p className="text-xs text-muted px-1.5 mt-1">No folders yet — organize documents like a Finder.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadFile(f);
        }}
      />

      {/* Row 1: title + actions */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Shared documents</h1>
          <p className="text-sm text-muted mt-1">
            Approved library only. Pending and rejected agent outputs stay on the project page.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button type="button" className="btn-primary text-sm" onClick={() => setComposeOpen(true)}>
            New document
          </button>
        </div>
      </div>

      {/* Mobile folder drawer */}
      <div className="lg:hidden">
        <button type="button" className="btn-secondary text-sm w-full" onClick={() => setFoldersOpen((v) => !v)}>
          {foldersOpen ? 'Hide folders' : 'Folders'}
        </button>
        {foldersOpen && <div className="mt-2">{folderPanel}</div>}
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-4 items-start min-h-[60vh]">
        <div className="hidden lg:block sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
          {folderPanel}
        </div>

        <div className="min-w-0 flex flex-col gap-3">
          {/* Row 2: filters aligned with list */}
          <div className="card p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <IconSearch
                width={14}
                height={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <input
                className="input pl-8 text-sm w-full"
                placeholder="Search title or filename…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </div>
            <select
              className="input text-sm w-auto min-w-[140px]"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <select
              className="input text-sm w-auto min-w-[140px]"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => {
                setClientId('');
                setProjectId('');
                setSearchQ('');
              }}
            >
              Clear
            </button>
            {storageUsage && (
              <div className="flex items-center gap-2 text-[11px] text-muted ml-auto shrink-0">
                <span className="font-mono whitespace-nowrap">
                  {formatBytes(storageUsage.usedBytes)} / {formatBytes(storageUsage.limitBytes)}
                </span>
                <div className="w-20 h-1.5 bg-neutral-200 overflow-hidden">
                  <div
                    className={`h-full ${
                      storageUsage.usedBytes / storageUsage.limitBytes >= 0.9 ? 'bg-danger' : 'bg-primary'
                    }`}
                    style={{
                      width: `${Math.min(100, (storageUsage.usedBytes / storageUsage.limitBytes) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Detail strip */}
          {selected && (
            <div className="card px-3 py-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-display font-semibold truncate max-w-[240px]">{selected.title}</span>
              <span className={fileKind(selected.mime_type).tone}>{fileKind(selected.mime_type).label}</span>
              {selected.project_id && (
                <Link to={`/projects/${selected.project_id}`} className="badge-accent hover:underline text-xs">
                  {selected.project_title || 'Project'}
                </Link>
              )}
              {selected.client_id && (
                <Link
                  to={`/clients/${selected.client_id}`}
                  className="badge bg-emerald-50 text-success hover:underline text-xs"
                >
                  {selected.client_name}
                </Link>
              )}
              <select
                className="input text-xs w-auto py-1"
                value={selected.folder_id || ''}
                onChange={(e) => relink(selected.id, { folderId: e.target.value || null })}
              >
                <option value="">Unfiled</option>
                {flatFolderOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <a className="btn-ghost text-xs py-1.5" href={`/api/documents/${selected.id}/download`}>
                  Download
                </a>
                {isTextish(selected.mime_type) && (
                  <a className="btn-ghost text-xs py-1.5" href={`/api/documents/${selected.id}/export/docx`} download>
                    Export
                  </a>
                )}
                <ConfirmButton
                  onConfirm={() => deleteDocument(selected.id)}
                  pending={deleting}
                  className="btn-ghost text-xs py-1.5 text-danger"
                  confirmClassName="btn-danger text-xs py-1.5"
                >
                  Delete
                </ConfirmButton>
              </div>
            </div>
          )}

          {/* File list — click opens preview */}
          <div
            ref={listRef}
            className="card overflow-hidden outline-none"
            tabIndex={0}
            onKeyDown={onListKeyDown}
          >
            {documents === null && (
              <div className="p-8 text-sm text-muted animate-pulse">Loading documents…</div>
            )}
            {documents !== null && !documents.length && (
              <div className="p-10 text-center text-sm text-muted">No documents for these filters</div>
            )}
            {documents !== null && documents.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                      <th className="px-3 py-2 font-semibold">Title</th>
                      <th className="px-3 py-2 font-semibold w-20">Type</th>
                      <th className="px-3 py-2 font-semibold hidden md:table-cell">Project</th>
                      <th className="px-3 py-2 font-semibold hidden lg:table-cell">Client</th>
                      <th className="px-3 py-2 font-semibold w-24 text-right">Size</th>
                      <th className="px-3 py-2 font-semibold w-28 hidden sm:table-cell">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => {
                      const kind = fileKind(d.mime_type);
                      const active = d.id === selectedId;
                      return (
                        <tr
                          key={d.id}
                          draggable
                          onDragStart={(e) => {
                            dragMovedRef.current = true;
                            e.dataTransfer.setData('text/plain', d.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            // allow next click after drag settles
                            setTimeout(() => {
                              dragMovedRef.current = false;
                            }, 0);
                          }}
                          className={`border-b border-line last:border-0 cursor-pointer ${
                            active ? 'bg-acc-100' : 'hover:bg-black/[0.02]'
                          }`}
                          onClick={() => {
                            if (dragMovedRef.current) return;
                            openPreview(d.id);
                          }}
                        >
                          <td className="px-3 py-2.5 min-w-0">
                            <div className="font-medium truncate max-w-[280px]">{d.title}</div>
                            {d.filename && (
                              <div className="text-[11px] text-muted truncate max-w-[280px]">{d.filename}</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={kind.tone}>{kind.label}</span>
                          </td>
                          <td className="px-3 py-2.5 hidden md:table-cell truncate max-w-[140px] text-muted">
                            {d.project_title || '—'}
                          </td>
                          <td className="px-3 py-2.5 hidden lg:table-cell truncate max-w-[120px] text-muted">
                            {d.client_name || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-muted whitespace-nowrap">
                            {formatBytes(d.size_bytes)}
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell text-xs text-muted whitespace-nowrap">
                            {formatDate(d.updated_at || d.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          siblings={docs}
          onClose={closePreview}
          onNavigate={navigatePreview}
          onDelete={deleteDocument}
          deleting={deleting}
        />
      )}

      {composeOpen && (
        <DocumentComposeModal
          saving={composeSaving}
          onClose={() => !composeSaving && setComposeOpen(false)}
          onSave={saveCompose}
        />
      )}
    </div>
  );
}
