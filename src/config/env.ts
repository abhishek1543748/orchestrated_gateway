export const config = {
  env: process.env.NODE_ENV || 'development',
  queue: {
    capacity: Number(process.env.QUEUE_CAPACITY) || 100,
  },
  worker: {
    count:              Number(process.env.WORKER_COUNT)            || 4,
    pollIntervalMs:     Number(process.env.WORKER_POLL_INTERVAL_MS) || 0,
    processingDelayMs:  Number(process.env.PROCESSING_DELAY_MS)     || 50,
    failureProbability: Number(process.env.FAILURE_PROBABILITY)     || 0.05,
    maxRetries:         Number(process.env.MAX_RETRIES)             || 3,
  },
  server: {
    port:          Number(process.env.PORT) || 3000,
    host:          process.env.HOST           || '0.0.0.0',
    allowedOrigin: process.env.ALLOWED_ORIGIN  || 'http://localhost:5173',
  },
};
