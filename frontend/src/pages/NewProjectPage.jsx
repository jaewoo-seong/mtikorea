import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { IconAlert, IconClock, IconLoader } from '../lib/icons';

const PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '12 hours', minutes: 720 },
];

function formatMinutes(m) {
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (!rem) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${h}h ${rem}m`;
}

export default function NewProjectPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [rawNotes, setRawNotes] = useState('');
  const [goal, setGoal] = useState('');
  const [desiredOutput, setDesiredOutput] = useState('');
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState(60);
  const [cleaning, setCleaning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [contextFiles, setContextFiles] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.clients.list().then((d) => setClients(d.clients)).catch(() => {});
  }, []);

  async function cleanWithAI() {
    if (!rawNotes.trim()) {
      toast.error('Dump some notes first — nothing to clean yet.');
      return;
    }
    setCleaning(true);
    try {
      const { cleanedPrompt } = await api.projects.cleanPrompt(rawNotes.trim());
      setGoal(cleanedPrompt);
      toast.success('Cleaned up — review and edit below before starting.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCleaning(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSubmitting(true);
    try {
      const { project } = await api.projects.create({
        title: title.trim(),
        goal: goal.trim() || rawNotes.trim() || null,
        clientId: clientId || null,
        timeBudgetMinutes,
        desiredOutput: desiredOutput.trim() || null,
      });
      if (contextFiles.length) {
        try {
          await api.projects.upload(project.id, contextFiles);
        } catch (err) {
          toast.error(`Project created, but file upload failed: ${err.message}`);
          navigate(`/projects/${project.id}`);
          return;
        }
      }
      toast.success('Project created');
      navigate(`/projects/${project.id}`);
    } catch (err) {
      toast.error(err.message);
      setSubmitting(false);
    }
  }

  function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    setContextFiles((prev) => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(idx) {
    setContextFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">New project</h1>
        <p className="text-sm text-muted mt-1">
          Set a title, a goal, and a time budget. This creates a draft you can review — the main
          agent only plans its agenda and sub-agent allocation, and starts working, once you click
          Start on the project page. It then keeps refining until time runs out, wrapping up with a
          summary instead of stopping mid-thought.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="card p-5 space-y-3">
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Title</span>
            <input
              className="input mt-1"
              required
              placeholder="Project title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Client (optional)</span>
            <select className="input mt-1" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="card p-5 space-y-3">
          <div>
            <span className="text-xs font-medium text-muted uppercase tracking-wide">
              Dump your rough notes
            </span>
            <p className="text-xs text-muted mt-0.5">
              Paste whatever you've got — bullet points, half-formed thoughts, a messy brain dump.
              "Clean with AI" turns it into a proper prompt below, which you can still edit before starting.
            </p>
          </div>
          <textarea
            className="input min-h-[100px] font-mono text-sm"
            placeholder="e.g. need a report on q3 client engagement, look at the emails, focus on renewal risk, maybe slides idk..."
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            onClick={cleanWithAI}
            disabled={cleaning}
          >
            {cleaning ? <IconLoader width={14} height={14} /> : null}
            {cleaning ? 'Cleaning…' : 'Clean with AI'}
          </button>

          <label className="block text-sm pt-2 border-t border-line">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">
              Prompt sent to the agent
            </span>
            <textarea
              className="input mt-1 min-h-[120px]"
              placeholder="The cleaned-up prompt appears here — or just type your goal directly, no need to use the dump above."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>
        </div>

        <div className="card p-5 space-y-3">
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">
              Desired output (optional)
            </span>
            <p className="text-xs text-muted mt-0.5 mb-1">
              What should the deliverable look like? Leave blank and the main agent decides based on
              the prompt once it starts.
            </p>
            <input
              className="input"
              placeholder="e.g. a slide deck outline, a written report, a spreadsheet of findings…"
              value={desiredOutput}
              onChange={(e) => setDesiredOutput(e.target.value)}
            />
          </label>
        </div>

        <div className="card p-5 space-y-3">
          <div>
            <span className="text-xs font-medium text-muted uppercase tracking-wide">
              Context files (optional)
            </span>
            <p className="text-xs text-muted mt-0.5">
              Attach reference files the agent should read before it starts — they'll show up in
              Documents once the project is created.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="input"
            onChange={onPickFiles}
          />
          {contextFiles.length > 0 && (
            <ul className="space-y-1">
              {contextFiles.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between text-xs bg-slate-50 border border-line rounded px-2 py-1"
                >
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    className="text-muted hover:text-danger ml-2 shrink-0"
                    onClick={() => removeFile(i)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase tracking-wide inline-flex items-center gap-1.5">
              <IconClock width={13} height={13} /> Time budget
            </span>
            <span className="font-mono text-sm font-semibold text-ink">
              {formatMinutes(timeBudgetMinutes)}
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={720}
            step={5}
            value={timeBudgetMinutes}
            onChange={(e) => setTimeBudgetMinutes(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[11px] text-muted">
            <span>5 min</span>
            <span>12 hours</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {PRESETS.map((p) => (
              <button
                key={p.minutes}
                type="button"
                className={`rounded-full px-3 py-1 text-xs border transition ${
                  timeBudgetMinutes === p.minutes
                    ? 'border-primary bg-blue-50 text-primary'
                    : 'border-line bg-white text-muted hover:bg-slate-50'
                }`}
                onClick={() => setTimeBudgetMinutes(p.minutes)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="rounded-lg bg-slate-50 border border-line px-3 py-2 text-xs text-muted flex items-start gap-2">
            <IconAlert width={13} height={13} className="mt-0.5 shrink-0" />
            When time runs out, the main agent wraps up with a final summary instead of stopping
            mid-thought. There's no cap on tokens or how many other projects can run at the same
            time — only this timer limits the loop.
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting
              ? contextFiles.length
                ? 'Creating & uploading…'
                : 'Creating…'
              : 'Create draft — review before Start'}
          </button>
        </div>
      </form>
    </div>
  );
}
