import type { Ctx } from '../context.js';
import { runDueSoon } from './automation.js';
import { queueDigests, sendQueuedEmail } from './mail.js';
import { deliverWebhooks } from './webhooks.js';

/**
 * In-process background worker (Flowdeck runs as one process). Each tick delivers due webhooks, runs
 * "due soon" automation rules, queues email digests and sends queued email. Work is claimed with
 * FOR UPDATE SKIP LOCKED, so a second instance (for example during a rolling restart) never double-sends.
 */
export class Worker {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(private ctx: Ctx) {}

  start(intervalMs: number) {
    if (intervalMs <= 0 || this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  /** One pass over every job. Concurrent calls share the pass in progress. */
  tick(): Promise<void> {
    if (!this.running)
      this.running = this.pass().finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async pass() {
    for (const [name, job] of [
      ['webhooks', () => deliverWebhooks(this.ctx)],
      ['due-soon automation', () => runDueSoon(this.ctx)],
      ['email digests', () => queueDigests(this.ctx)],
      ['email', () => sendQueuedEmail(this.ctx)],
    ] as const) {
      try {
        await job();
      } catch (err) {
        console.error(`background job "${name}" failed:`, (err as Error).message);
      }
    }
  }
}
