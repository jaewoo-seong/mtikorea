const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('MTI CRM scaffold', () => {
  it('has Railway Postgres migration without supabase', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/001_init.sql'),
      'utf8'
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS clients/);
    assert.match(sql, /claim_next_project/);
    assert.equal(/create table.*supabase/i.test(sql), false);
    assert.equal(/supabase\./i.test(sql), false);
  });

  it('backend package has pg and not @supabase', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
    );
    assert.ok(pkg.dependencies.pg);
    assert.equal(Boolean(pkg.dependencies['@supabase/supabase-js']), false);
  });

  it('frontend CRM routes exist', () => {
    const app = fs.readFileSync(
      path.join(__dirname, '../../frontend/src/App.jsx'),
      'utf8'
    );
    for (const route of ['/clients', '/email', '/projects', '/documents', '/tasks', '/admin']) {
      assert.match(app, new RegExp(route.replace('/', '\\/')));
    }
    assert.equal(app.includes('AssistantHome'), false);
  });

  it('worker claims projects not supabase jobs', () => {
    const worker = fs.readFileSync(
      path.join(__dirname, '../../worker/src/index.js'),
      'utf8'
    );
    assert.match(worker, /claim_next_project/);
    assert.equal(worker.includes('supabase'), false);
  });

  it('worker has Haiku orchestrator + OpenRouter client', () => {
    const runner = fs.readFileSync(
      path.join(__dirname, '../../worker/src/projectRunner.js'),
      'utf8'
    );
    const orch = fs.readFileSync(
      path.join(__dirname, '../../worker/src/orchestrator.js'),
      'utf8'
    );
    assert.match(runner, /runOrchestratorCycle/);
    assert.match(orch, /anthropic\/claude-haiku-4\.5|getMainModel/);
    assert.ok(
      fs.existsSync(path.join(__dirname, '../../worker/src/llm/openrouter.js'))
    );
  });
});
