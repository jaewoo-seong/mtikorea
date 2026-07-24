import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { IconAlert, IconClock, IconLoader } from '../lib/icons';

const PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '12 hours', minutes: 720 },
];

const STEPS = [
  { id: 'identity', label: 'Identity' },
  { id: 'brief', label: 'Brief' },
  { id: 'shape', label: 'Shape' },
  { id: 'budget', label: 'Budget' },
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
  const [step, setStep] = useState(0);
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
      toast.success('Cleaned up — review and edit before continuing.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCleaning(false);
    }
  }

  function canNext() {
    if (step === 0) return Boolean(title.trim());
    if (step === 1) return Boolean(goal.trim() || rawNotes.trim());
    return true;
  }

  function goNext() {
    if (!canNext()) {
      if (step === 0) toast.error('Title is required');
      else if (step === 1) toast.error('Add a goal or rough notes first');
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      setStep(0);
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
      toast.success('Draft created — review the Brief tab, then Start');
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

  const clientName = clients.find((c) => c.id === clientId)?.name;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link to="/projects" className="text-sm text-muted hover:text-primary">
          ← Projects
        </Link>
        <h1 className="text-3xl mt-2">New project</h1>
        <p className="text-sm text-muted mt-1">
          Guided brief → draft. The agent only starts working after you click Start on the project page.
        </p>
      </div>

      <div className="seg flex-wrap w-full">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`seg-opt flex-1 ${step === i ? 'seg-opt-active' : ''} ${i < step ? 'text-ink' : ''}`}
            onClick={() => setStep(i)}
          >
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {step === 0 && (
          <div className="card p-5 space-y-3">
            <p className="card-kicker">Step 1 · Identity</p>
            <label className="block text-sm">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Title</span>
              <input
                className="input mt-1"
                required
                placeholder="Project title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Client (optional)</span>
              <select className="input mt-1" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="card p-5 space-y-3">
            <p className="card-kicker">Step 2 · Brief</p>
            <div>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Dump your rough notes</span>
              <p className="text-xs text-muted mt-0.5">
                Paste bullets or a brain dump. Clean with AI turns it into the prompt below — or type the goal
                directly.
              </p>
            </div>
            <textarea
              className="input min-h-[100px] font-mono text-sm"
              placeholder="e.g. need a report on q3 client engagement…"
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
                placeholder="Cleaned prompt or type your goal here"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="card p-5 space-y-4">
            <p className="card-kicker">Step 3 · Shape</p>
            <label className="block text-sm">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">
                Desired output (optional)
              </span>
              <p className="text-xs text-muted mt-0.5 mb-1">
                Leave blank and the main agent decides based on the prompt once it starts.
              </p>
              <input
                className="input"
                placeholder="e.g. a slide deck outline, a written report…"
                value={desiredOutput}
                onChange={(e) => setDesiredOutput(e.target.value)}
              />
            </label>
            <div>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">
                Context files (optional)
              </span>
              <p className="text-xs text-muted mt-0.5 mb-2">
                Reference files for the agent before it starts.
              </p>
              <input ref={fileInputRef} type="file" multiple className="input" onChange={onPickFiles} />
              {contextFiles.length > 0 && (
                <ul className="space-y-1 mt-2">
                  {contextFiles.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between text-xs bg-surface border border-line px-2 py-1"
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
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="card p-5 space-y-3">
              <p className="card-kicker">Step 4 · Budget</p>
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
              <div className="seg flex-wrap">
                {PRESETS.map((p) => (
                  <button
                    key={p.minutes}
                    type="button"
                    className={`seg-opt ${timeBudgetMinutes === p.minutes ? 'seg-opt-active' : ''}`}
                    onClick={() => setTimeBudgetMinutes(p.minutes)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="border border-line bg-surface px-3 py-2 text-xs text-muted flex items-start gap-2">
                <IconAlert width={13} height={13} className="mt-0.5 shrink-0" />
                When time runs out, the main agent wraps up instead of stopping mid-thought. No token cap —
                only this timer limits the loop.
              </div>
            </div>

            <div className="card p-5 space-y-2">
              <p className="card-kicker">Review before create</p>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Title</dt>
                  <dd className="font-medium text-right">{title || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Client</dt>
                  <dd className="text-right">{clientName || 'None'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Goal</dt>
                  <dd className="mt-1 text-sm line-clamp-4 whitespace-pre-wrap">
                    {goal.trim() || rawNotes.trim() || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Desired output</dt>
                  <dd className="text-right">{desiredOutput.trim() || 'Agent decides'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Context files</dt>
                  <dd className="text-right">{contextFiles.length}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Time budget</dt>
                  <dd className="font-mono text-right">{formatMinutes(timeBudgetMinutes)}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-between">
          <button
            type="button"
            className="btn-secondary"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </button>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn-primary" onClick={goNext}>
                Next
              </button>
            ) : (
              <button className="btn-primary" type="submit" disabled={submitting}>
                {submitting
                  ? contextFiles.length
                    ? 'Creating & uploading…'
                    : 'Creating…'
                  : 'Create draft — review before Start'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
