import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { IncomingMessage } from './types';
import { config } from './config/env';
import { InMemoryQueue } from './queue/InMemoryQueue';
import { ProcessedStore } from './store/ProcessedStore';
import { DeadLetterStore } from './store/DeadLetterStore';
import { WorkerPool } from './worker/WorkerPool';
import { logger } from './logger';

const app = express();

// --- Security: limit payload size to prevent oversized request attacks ---
app.use(express.json({ limit: '100kb' }));

// ─────────────────────────────────────────────
// Throughput counter — 1-second sliding window
// Records a timestamp for each successfully processed message, then counts
// how many timestamps fall within the last second to produce a per-sec rate.
// ─────────────────────────────────────────────
const processedTimestamps: number[] = [];

function recordProcessed(): void {
  processedTimestamps.push(Date.now());
}

function getProcessedPerSec(): number {
  const cutoff = Date.now() - 1_000;
  // Evict timestamps older than 1 second (array is chronological, so shift from front)
  while (processedTimestamps.length > 0 && processedTimestamps[0] < cutoff) {
    processedTimestamps.shift();
  }
  return processedTimestamps.length;
}

// ─────────────────────────────────────────────
// Compose the system
// ─────────────────────────────────────────────
const queue          = new InMemoryQueue<IncomingMessage>(config.queue.capacity);
const processedStore = new ProcessedStore();
const deadLetterStore = new DeadLetterStore();
const workerPool     = new WorkerPool(
  queue,
  processedStore,
  deadLetterStore,
  config.worker.count,
  recordProcessed,      // throughput callback
);
workerPool.start();

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────

/** Health check — used by Railway / load balancers to verify the process is alive. */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status:     'ok',
    uptime:     process.uptime(),
    timestamp:  new Date().toISOString(),
    queueDepth: queue.depth(),
  });
});

/** Primary ingestion endpoint — accept a webhook, normalise, enqueue, return immediately. */
app.post('/webhook', (req: Request, res: Response) => {
  // Basic body validation — reject obviously malformed requests early
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Request body must be a JSON object' });
    return;
  }

  const msg: IncomingMessage = {
    source:     String(req.body.source ?? 'generic-webhook'),
    id:         String(req.body.id     ?? randomUUID()),
    receivedAt: new Date().toISOString(),
    payload:    req.body,
  };

  // Backpressure policy: reject immediately when queue is full — never block
  if (!queue.enqueue(msg)) {
    logger.warn({ queueDepth: queue.depth(), capacity: config.queue.capacity }, 'Queue full — returning 429');
    res.status(429).json({ error: 'queue full — retry later' });
    return;
  }

  logger.info({ msgId: msg.id, source: msg.source, queueDepth: queue.depth() }, 'Webhook enqueued');
  res.status(200).json({ status: 'enqueued', id: msg.id });
});

/** Inspect messages that failed after exhausting all retries. */
app.get('/dead-letters', (_req: Request, res: Response) => {
  res.json({ deadLetters : deadLetterStore.getAll() });
});

/** Lightweight observability — read-only snapshot of system state. */
app.get('/metrics', (_req: Request, res: Response) => {
  res.json({
    queueDepth:              queue.depth(),
    processedTotal:          processedStore.size(),
    messagesProcessedPerSec: getProcessedPerSec(),
    failureCount:            deadLetterStore.getCount(),
    deadLetterCount:         deadLetterStore.getCount(),
  });
});

// ─────────────────────────────────────────────
// Server startup + graceful shutdown
// ─────────────────────────────────────────────
const PORT   = Number(process.env.PORT) || config.server.port;
const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: config.env }, '🚀 Server started');
});

/**
 * Graceful shutdown — stops accepting new connections, lets workers drain,
 * then exits cleanly. Railway sends SIGTERM before killing the process.
 */
function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutdown signal received — stopping workers and draining...');
  workerPool.stop();
  server.close(() => {
    logger.info({}, 'HTTP server closed. Process exiting cleanly.');
    process.exit(0);
  });
  // Force-exit if drain takes longer than 10 s (safety net)
  setTimeout(() => {
    logger.error({}, 'Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10_000).unref(); // .unref() so this timer doesn't keep the event loop alive unnecessarily
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
