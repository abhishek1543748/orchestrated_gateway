import { Queue } from '../queue/Queue';
import { IncomingMessage } from '../types';
import { ProcessedStore } from '../store/ProcessedStore';
import { DeadLetterStore } from '../store/DeadLetterStore';
import { config } from '../config/env';
import { logger } from '../logger';

export class WorkerPool {
  private intervalIds: NodeJS.Timeout[] = [];
  private readonly workerCount: number;

  /**
   * Tracks how many times each message (keyed by "source:id") has been attempted.
   * Entries are removed once the message succeeds or is moved to the DLQ.
   */
  private readonly retryMap = new Map<string, number>();

  constructor(
    private readonly queue: Queue<IncomingMessage>,
    private readonly processed: ProcessedStore,
    private readonly deadLetter: DeadLetterStore,
    workerCount?: number,
    /** Optional callback fired each time a message is successfully processed.
     *  Used by the metrics layer to compute throughput. */
    private readonly onProcessed?: () => void,
  ) {
    this.workerCount = workerCount ?? config.worker.count;
  }

  start(): void {
    if (this.intervalIds.length) return; // already running
    for (let i = 0; i < this.workerCount; i++) {
      const id = setInterval(() => { void this.runWorker(); }, config.worker.pollIntervalMs);
      this.intervalIds.push(id);
    }
    logger.info({ workerCount: this.workerCount, pollIntervalMs: config.worker.pollIntervalMs }, 'Worker pool started');
  }

  stop(): void {
    for (const id of this.intervalIds) clearInterval(id);
    this.intervalIds = [];
    logger.info({}, 'Worker pool stopped');
  }

  private async runWorker(): Promise<void> {
    const item = this.queue.dequeue();
    if (!item) return; // nothing to do this tick

    // Simulate real async work (delay is configurable via env)
    await new Promise<void>(res => setTimeout(res, config.worker.processingDelayMs));

    // Idempotency: skip if this message was already completed successfully
    if (this.processed.has(item)) {
      logger.debug({ msgId: item.id, source: item.source }, 'Duplicate message skipped (already processed)');
      return;
    }

    // Simulate random failure (probability is configurable via env)
    const failed = Math.random() < config.worker.failureProbability;
    if (failed) {
      const key = `${item.source}:${item.id}`;
      const attempts = (this.retryMap.get(key) ?? 0) + 1;

      if (attempts < config.worker.maxRetries) {
        // Still have retries left — put it back on the queue
        this.retryMap.set(key, attempts);
        this.queue.enqueue(item);
        logger.warn(
          { msgId: item.id, attempts, maxRetries: config.worker.maxRetries },
          'Processing failed — requeueing for retry',
        );
      } else {
        // Exhausted retries — move to dead-letter queue
        this.retryMap.delete(key);
        this.deadLetter.add(item, `failed after ${attempts} attempt(s)`);
        logger.error(
          { msgId: item.id, attempts },
          'Message sent to dead-letter queue after max retries',
        );
      }
      return;
    }

    // Success path
    this.retryMap.delete(`${item.source}:${item.id}`);
    this.processed.add(item);
    this.onProcessed?.();
    logger.debug({ msgId: item.id, source: item.source }, 'Message processed successfully');
  }
}
