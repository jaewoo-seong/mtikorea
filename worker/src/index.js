/**
 * Railway worker — claims running projects and advances agents until Stop / budget.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { runProjectStep } = require('./projectRunner');

const PORT = process.env.WORKER_PORT || process.env.PORT || 4001;
const workerId = `worker-${crypto.randomUUID()}`;
// No cap on concurrently running projects by default — every running project gets
// claimed and worked as soon as this worker polls. Set WORKER_MAX_CONCURRENT to a
// positive number to reintroduce a ceiling (e.g. to bound total worker memory/CPU).
const rawMaxConcurrent = Number(process.env.WORKER_MAX_CONCURRENT);
const MAX_CONCURRENT = Number.isFinite(rawMaxConcurrent) && rawMaxConcurrent > 0 ? rawMaxConcurrent : Infinity;

function makePool() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : undefined,
    // Recycle idle clients so Railway/Postgres restarts don't leave toxic sockets
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  pool.on('error', (err) => {
    // Must be handled or Node exits — claim loop will open a fresh client next tick
    console.error('[Worker] idle pool error (will reconnect):', err.message);
  });
  return pool;
}

let pool = makePool();
let runningCount = 0;
let lastClaimAt = null;
let lastClaimProjectId = null;
let lastError = null;

process.on('unhandledRejection', (err) => {
  console.error('[Worker] unhandledRejection', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[Worker] uncaughtException', err?.message || err);
});

const app = express();
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'worker',
    workerId,
    runningCount,
    maxConcurrent: Number.isFinite(MAX_CONCURRENT) ? MAX_CONCURRENT : 'unlimited',
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasOpenRouter: Boolean(process.env.OPENROUTER_API_KEY),
    lastClaimAt,
    lastClaimProjectId,
    lastError,
  });
});
app.listen(PORT, () => console.log(`MTI CRM worker health :${PORT}`));

async function claimNext() {
  try {
    const { rows } = await pool.query('SELECT * FROM claim_next_project($1)', [workerId]);
    return rows[0] || null;
  } catch (err) {
    lastError = err.message;
    console.error('[Worker] claim query failed:', err.message);
    // Recreate pool after connection failures
    try {
      await pool.end().catch(() => {});
    } catch {
      /* ignore */
    }
    pool = makePool();
    throw err;
  }
}

async function claimLoop() {
  if (!process.env.DATABASE_URL) {
    console.error('[Worker] DATABASE_URL missing — cannot claim. Set it on the Worker service.');
  } else {
    console.log('[Worker] DATABASE_URL present — claim loop active');
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('[Worker] OPENROUTER_API_KEY missing — will run local mock cycles only');
  }

  while (true) {
    if (!process.env.DATABASE_URL) {
      await sleep(5000);
      continue;
    }
    if (runningCount >= MAX_CONCURRENT) {
      await sleep(1000);
      continue;
    }
    try {
      const project = await claimNext();
      if (!project) {
        await sleep(2000);
        continue;
      }
      lastClaimAt = new Date().toISOString();
      lastClaimProjectId = project.id;
      lastError = null;
      runningCount += 1;
      console.log(`[Worker ${workerId}] claimed ${project.id} (${project.title})`);
      runProjectStep(pool, project)
        .catch((err) => {
          lastError = err.message;
          console.error('[Worker] step error', err);
        })
        .finally(() => {
          runningCount -= 1;
        });
    } catch (err) {
      lastError = err.message;
      console.error('[Worker] claim loop', err.message);
      await sleep(5000);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log(`[Worker] starting ${workerId}`);
claimLoop();
