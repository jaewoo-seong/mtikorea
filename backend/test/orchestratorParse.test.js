const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { parseAgentJson, normalizePlan } = require(
  path.join(__dirname, '../../worker/src/parseAgentJson.js')
);
const { projectProgress } = require('../src/lib/projectProgress');
const { getMainModel, getSubModels } = require(
  path.join(__dirname, '../../worker/src/llm/openrouter.js')
);

describe('parseAgentJson', () => {
  it('parses fenced JSON', () => {
    const out = parseAgentJson('```json\n{"status":"continue","progress_pct":40,"summary":"hi"}\n```');
    assert.equal(out.status, 'continue');
    assert.equal(out.progress_pct, 40);
    assert.equal(out.summary, 'hi');
  });

  it('extracts object from surrounding prose', () => {
    const out = parseAgentJson('Here you go:\n{"status":"done","summary":"wrapped"}\nThanks');
    assert.equal(out.status, 'done');
    assert.equal(out.summary, 'wrapped');
  });

  it('falls back on broken JSON', () => {
    const out = parseAgentJson('not json at all', { status: 'continue', progress_pct: 10 });
    assert.equal(out.status, 'continue');
    assert.ok(out._parseError);
    assert.match(out.summary, /not json/);
  });
});

describe('normalizePlan', () => {
  it('caps subtasks and coerces progress', () => {
    const plan = normalizePlan(
      {
        status: 'weird',
        progress_pct: 150,
        summary: 'ok',
        subtasks: [
          { role: 'researcher', prompt: 'a' },
          { role: 'drafter', prompt: 'b' },
          { role: 'x', prompt: '' },
        ],
        outputs: [{ title: 'T', content_markdown: '# hi' }],
      },
      3
    );
    assert.equal(plan.status, 'continue');
    assert.equal(plan.progress_pct, 100);
    assert.equal(plan.subtasks.length, 2);
    assert.equal(plan.outputs.length, 1);
  });
});

describe('projectProgress agent merge', () => {
  it('takes max of agent push and floors', () => {
    const m = projectProgress(
      { tokens_used: 0, token_budget: 1000, progress_pct: 5 },
      new Date(),
      55
    );
    assert.equal(m.progressPct, 55);
    assert.equal(m.agentPct, 55);
  });
});

describe('openrouter model env helpers', () => {
  it('defaults main to Haiku when unset', () => {
    const prevMain = process.env.OPENROUTER_MAIN_MODEL;
    const prevWorker = process.env.OPENROUTER_WORKER_MODEL;
    delete process.env.OPENROUTER_MAIN_MODEL;
    delete process.env.OPENROUTER_WORKER_MODEL;
    try {
      assert.equal(getMainModel(), 'anthropic/claude-haiku-4.5');
      assert.ok(getSubModels().length >= 1);
    } finally {
      if (prevMain != null) process.env.OPENROUTER_MAIN_MODEL = prevMain;
      if (prevWorker != null) process.env.OPENROUTER_WORKER_MODEL = prevWorker;
    }
  });
});
