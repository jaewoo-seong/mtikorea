/**
 * Railway worker — claims running projects and advances agents until Stop / budget.
 * Pattern audited from mtiV2 claim loop; reimplemented against projects + node-pg.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { runProjectStep } = require('./projectRunner');

const PORT = process.env.WORKER_PORT || process.env.PORT || 4001;
const workerId = `worker-${crypto.randomUUID()}`;
const MAX_CONCURRENT = Number(process.env.WORKER_MAX_CONCURRENT || 3);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let runningCount = 0;

const app = express();
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'worker',
    workerId,
    runningCount,
    maxConcurrent: MAX_CONCURRENT,
  });
});
app.listen(PORT, () => console.log(`MTI CRM worker health :${PORT}`));

async function claimNext() {
  const { rows } = await pool.query('SELECT * FROM claim_next_project($1)', [workerId]);
  return rows[0] || null;
}

async function claimLoop() {
  while (true) {
    if (!process.env.DATABASE_URL) {
      console.error('[Worker] DATABASE_URL missing');
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
      runningCount += 1;
      console.log(`[Worker ${workerId}] claimed ${project.id} (${project.title})`);
      runProjectStep(pool, project, workerId)
        .catch((err) => console.error('[Worker] step error', err))
        .finally(() => {
          runningCount -= 1;
        });
    } catch (err) {
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
