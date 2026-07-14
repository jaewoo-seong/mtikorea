import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');

  async function load() {
    const d = await api.projects.get(id);
    setData(d);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    const t = setInterval(() => {
      load().catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [id]);

  async function start() {
    await api.projects.start(id);
    setMsg('Started — worker will claim and keep working');
    await load();
  }

  async function stop() {
    await api.projects.stop(id);
    setMsg('Stopped');
    await load();
  }

  async function onUpload(e) {
    const files = e.target.files;
    if (!files?.length) return;
    await api.projects.upload(id, files);
    setMsg(`Uploaded ${files.length} file(s)`);
    e.target.value = '';
    await load();
  }

  if (!data) return <div className="text-sm text-muted">{msg || 'Loading…'}</div>;
  const { project, files, logs, results } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/projects" className="text-sm text-muted hover:text-primary">← Projects</Link>
          <h1 className="font-display text-3xl font-semibold mt-2">{project.title}</h1>
          <p className="text-sm text-muted mt-1">{project.goal}</p>
        </div>
        <div className="flex gap-2">
          {(project.status === 'draft' || project.status === 'paused') && (
            <button type="button" className="btn-primary" onClick={start}>Start</button>
          )}
          {project.status === 'running' && (
            <button type="button" className="btn-danger" onClick={stop}>Stop</button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-muted">Status</div>
          <div className="font-medium capitalize mt-1">{project.status}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Tokens</div>
          <div className="font-mono mt-1">{project.tokens_used} / {project.token_budget}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Upload files (draft/paused only)</div>
          <input type="file" multiple className="mt-2 text-sm" onChange={onUpload}
            disabled={project.status === 'running'} />
        </div>
      </div>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-medium mb-3">Files</h2>
          <ul className="text-sm space-y-2">
            {files.map((f) => (
              <li key={f.id} className="flex justify-between border-b border-line pb-2">
                <span>{f.filename}</span>
                <span className="text-muted text-xs">{f.size_bytes} B</span>
              </li>
            ))}
            {!files.length && <li className="text-muted">No files uploaded</li>}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-medium mb-3">Results</h2>
          <ul className="text-sm space-y-2">
            {results.map((r) => (
              <li key={r.id} className="border border-line rounded-lg p-3">
                <div className="font-medium">{r.title}</div>
                <div className="text-muted text-xs mt-1">{r.summary}</div>
              </li>
            ))}
            {!results.length && <li className="text-muted">No results yet</li>}
          </ul>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-medium mb-3">Work log</h2>
        <div className="space-y-3 max-h-[480px] overflow-y-auto font-mono text-xs">
          {logs.map((l) => (
            <div key={l.id} className="border-l-2 border-primary/40 pl-3">
              <div className="text-muted">#{l.step_number} · {l.phase} · {l.action} · {l.tokens_used} tok</div>
              <div className="mt-1 whitespace-pre-wrap font-sans text-sm">{l.detail}</div>
            </div>
          ))}
          {!logs.length && <div className="text-muted font-sans">No agent activity until Start</div>}
        </div>
      </div>
    </div>
  );
}
