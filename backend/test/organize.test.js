const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('organizeAgent module shape', () => {
  it('exports organizeFilesToClient', () => {
    const mod = require('../src/services/organizeAgent');
    assert.equal(typeof mod.organizeFilesToClient, 'function');
  });
});

describe('projectRunner module shape', () => {
  it('exports runProjectStep', () => {
    const mod = require('../../worker/src/projectRunner');
    assert.equal(typeof mod.runProjectStep, 'function');
  });
});
