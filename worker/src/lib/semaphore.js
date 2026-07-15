/**
 * Process-wide counting semaphore. Gates total concurrent sub-agent LLM calls
 * across every project this worker instance is running, independent of how many
 * projects/sub-agents each individual cycle wants to fire off in parallel.
 *
 * Single-process only — does not coordinate across multiple worker instances.
 */
class Semaphore {
  constructor(max) {
    this.max = Math.max(1, max);
    this.current = 0;
    this.queue = [];
  }

  acquire() {
    if (this.current < this.max) {
      this.current += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release() {
    this.current -= 1;
    const next = this.queue.shift();
    if (next) {
      this.current += 1;
      next();
    }
  }

  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const globalSubAgentSemaphore = new Semaphore(
  Number(process.env.WORKER_GLOBAL_SUBAGENT_CONCURRENCY || 20)
);

module.exports = { Semaphore, globalSubAgentSemaphore };
