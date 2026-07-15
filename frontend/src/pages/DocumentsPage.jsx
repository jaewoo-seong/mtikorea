import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import DocumentPreview from '../components/DocumentPreview';
import ConfirmButton from '../components/ConfirmButton';
import { useToast } from '../components/Toast';

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
        className={`group flex items-center gap-1 rounded px-1.5 py-1 text-sm cursor-pointer ${
          dragOver
            ? 'bg-blue-100 ring-2 ring-primary'
            : selectedId === folder.id
              ? 'bg-blue-50 text-primary'
              : 'hover:bg-slate-50'
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
              if (e.key === 'Escape') { setName(folder.name); setEditing(false); }
            }}
          />
        ) : (
          <span className="truncate flex-1 min-w-0" onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
            {folder.name}
          </span>
        )}
        <span className="text-[11px] text-muted shrink-0">{folder.document_count}</span>
        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="New subfolder"
            className="text-muted hover:text-primary px-1"
            onClick={(e) => { e.stopPropagation(); onAddChild(folder.id); }}
          >
            +
          </button>
          <ConfirmButton
            onConfirm={() => onDelete(folder.id)}
            className="text-muted hover:text-danger px-1"
          >
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

function SkeletonCard() {
  return (
    <div className="card p-5 animate-pulse space-y-3">
      <div className="h-4 w-2/3 bg-slate-100 rounded" />
      <div className="h-3 w-1/2 bg-slate-100 rounded" />
      <div className="flex gap-2">
        <div className="h-5 w-16 bg-slate-100 rounded-full" />
        <div className="h-5 w-16 bg-slate-100 rounded-full" />
      </div>
      <div className="h-8 bg-slate-100 rounded" />
    </div>
  );
}

export default function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState(null);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderFilter, setFolderFilter] = useState('all'); // 'all' | 'root' | folder id
  const [unfiledDragOver, setUnfiledDragOver] = useState(false);
  const [clientId, setClientId] = useState(searchParams.get('clientId') || '');
  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '');
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toast = useToast();

  const folderTree = buildFolderTree(folders);
  const flatFolderOptions = [];
  (function flatten(nodes, depth) {
    for (const f of nodes) {
      flatFolderOptions.push({ id: f.id, label: `${'— '.repeat(depth)}${f.name}` });
      flatten(f.children, depth + 1);
    }
  })(folderTree, 0);

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

  function togglePreview(docId) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  async function load() {
    const [d, c, p] = await Promise.all([
      api.documents.list({
        clientId: clientId || undefined,
        projectId: projectId || undefined,
        folderId: folderFilter === 'all' ? undefined : folderFilter,
      }),
      api.clients.list(),
      api.projects.list(),
    ]);
    setDocuments(d.documents);
    setClients(c.clients);
    setProjects(p.projects);
  }

  useEffect(() => {
    loadFolders().catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    const next = {};
    if (clientId) next.clientId = clientId;
    if (projectId) next.projectId = projectId;
    setSearchParams(next, { replace: true });
    load().catch((e) => toast.error(e.message));
  }, [clientId, projectId, folderFilter]);

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    try {
      await api.documents.upload(file, {
        title: title || file.name,
        clientId: clientId || undefined,
        projectId: projectId || undefined,
      });
      setFile(null);
      setTitle('');
      toast.success('Uploaded — linked to filters above');
      await load();
    } catch (err) {
      toast.error(err.message);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Shared documents</h1>
        <p className="text-sm text-muted mt-1">
          Approved library only. Agent outputs stay hidden in project staging until someone clicks Approve.
          Title = document ID for references. Link to client / project either way.
        </p>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-5 items-start">
        <div className="card p-3 min-w-0">
          <div className="flex items-center justify-between px-1.5 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Folders</span>
            <button
              type="button"
              title="New folder"
              className="text-muted hover:text-primary text-sm px-1"
              onClick={() => createFolder(folderFilter !== 'all' && folderFilter !== 'root' ? folderFilter : null)}
            >
              + New
            </button>
          </div>
          <div
            className={`rounded px-1.5 py-1 text-sm cursor-pointer ${folderFilter === 'all' ? 'bg-blue-50 text-primary' : 'hover:bg-slate-50'}`}
            onClick={() => setFolderFilter('all')}
          >
            All documents
          </div>
          <div
            className={`rounded px-1.5 py-1 text-sm cursor-pointer ${
              unfiledDragOver
                ? 'bg-blue-100 ring-2 ring-primary'
                : folderFilter === 'root'
                  ? 'bg-blue-50 text-primary'
                  : 'hover:bg-slate-50'
            }`}
            onClick={() => setFolderFilter('root')}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => { e.preventDefault(); setUnfiledDragOver(true); }}
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
                onSelect={setFolderFilter}
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

        <div className="space-y-6 min-w-0">
      <div className="card p-4 grid md:grid-cols-3 gap-3">
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={() => { setClientId(''); setProjectId(''); }}>
          Clear filters
        </button>
      </div>

      <form onSubmit={upload} className="card p-4 grid md:grid-cols-4 gap-3">
        <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div className="text-xs text-muted self-center">
          Upload uses current project/client filters when set
        </div>
        <button className="btn-primary" type="submit">Upload</button>
      </form>

      {documents === null && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {documents !== null && (
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {documents.map((d) => (
          <article
            key={d.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', d.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            className="card p-5 flex flex-col gap-3 border border-line min-w-0 cursor-grab active:cursor-grabbing"
          >
            <div>
              <h2 className="font-semibold text-base leading-snug">{d.title}</h2>
              <p className="text-xs text-muted mt-1 truncate">{d.description || d.filename}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {d.project_id ? (
                <Link to={`/projects/${d.project_id}`} className="badge bg-blue-50 text-primary hover:underline">
                  {d.project_title || 'Project'}
                </Link>
              ) : (
                <span className="badge bg-slate-100 text-muted">No project</span>
              )}
              {d.client_id ? (
                <Link to={`/clients/${d.client_id}`} className="badge bg-emerald-50 text-success hover:underline">
                  {d.client_name}
                </Link>
              ) : (
                <span className="badge bg-slate-100 text-muted">No client</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="input text-xs"
                value={d.project_id || ''}
                onChange={(e) => relink(d.id, { projectId: e.target.value || null })}
              >
                <option value="">Link project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <select
                className="input text-xs"
                value={d.client_id || ''}
                onChange={(e) => relink(d.id, { clientId: e.target.value || null })}
              >
                <option value="">Link client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                className="input text-xs col-span-2"
                value={d.folder_id || ''}
                onChange={(e) => relink(d.id, { folderId: e.target.value || null })}
              >
                <option value="">Unfiled — no folder</option>
                {flatFolderOptions.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="mt-auto flex items-center justify-between text-xs text-muted pt-2 border-t border-line">
              <span>{d.uploader_name || 'System'}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
                  onClick={() => togglePreview(d.id)}
                >
                  {expandedIds.has(d.id) ? 'Hide preview' : 'Preview'}
                </button>
                <a className="text-primary font-medium hover:underline" href={`/api/documents/${d.id}/download`}>
                  Download
                </a>
              </div>
            </div>
            {expandedIds.has(d.id) && (
              <div className="pt-2 border-t border-line">
                <DocumentPreview documentId={d.id} />
              </div>
            )}
          </article>
        ))}
      </div>
      )}
      {documents !== null && !documents.length && (
        <div className="card p-10 text-center text-sm text-muted">No documents for these filters</div>
      )}
        </div>
      </div>
    </div>
  );
}
