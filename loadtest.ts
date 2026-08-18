/**
 * loadtest.ts — OrchestratedGateway load simulation
 *
 * Simulates how high-traffic systems stress-test their ingestion pipelines.
 * Runs four phases: ramp-up ? sustained ? spike ? cooldown.
 * Prints live metrics every second and saves a full report to loadtest-report-<ts>.json.
 *
 * Usage:
 *   npx tsx loadtest.ts                            # hits localhost:3000
 *   TARGET_URL=https://your-app.railway.app npx tsx loadtest.ts
 *   npx tsx loadtest.ts --concurrency=500 --duration=60
 *   npx tsx loadtest.ts --spike-concurrency=2000 --spike-duration=10
 */

// --- Config (override via env vars or CLI flags) ------------------------------
const TARGET_URL  = process.env.TARGET_URL  ?? 'http://localhost:3000';
const ENDPOINT    = `${TARGET_URL}/webhook`;
const METRICS_URL = `${TARGET_URL}/metrics`;

function cliFlag(name: string, fallback: number): number {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  return arg ? Number(arg.split('=')[1]) : fallback;
}

const RAMP_CONCURRENCY       = cliFlag('ramp-concurrency',   50);
const SUSTAINED_CONCURRENCY  = cliFlag('concurrency',        200);
const SPIKE_CONCURRENCY      = cliFlag('spike-concurrency',  1000);
const RAMP_DURATION_S        = cliFlag('ramp-duration',      10);
const SUSTAINED_DURATION_S   = cliFlag('duration',           20);
const SPIKE_DURATION_S       = cliFlag('spike-duration',     5);
const COOLDOWN_DURATION_S    = cliFlag('cooldown-duration',  10);

// --- Types --------------------------------------------------------------------
interface RequestResult {
  status:    number;
  latencyMs: number;
  phase:     string;
  error?:    string;
}

interface PhaseStats {
  total:     number;
  ok200:     number;
  rej429:    number;
  errors:    number;
  latencies: number[];
}

// --- State --------------------------------------------------------------------
const results: RequestResult[] = [];
let running = true;

// --- Helpers -----------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function makePayload(phase: string): object {
  return {
    source:  'loadtest',
    id:      `${phase}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    event:   'test.fired',
    phase,
    sentAt:  new Date().toISOString(),
    data:    { userId: Math.floor(Math.random() * 1_000_000), value: Math.random() * 100 },
  };
}

async function fireRequest(phase: string): Promise<RequestResult> {
  const start = performance.now();
  try {
    const res = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(makePayload(phase)),
      signal:  AbortSignal.timeout(10_000),
    });
    return { status: res.status, latencyMs: performance.now() - start, phase };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 0, latencyMs: performance.now() - start, phase, error: msg };
  }
}

// --- Phase runner -------------------------------------------------------------
async function runPhase(name: string, concurrency: number, durationSec: number): Promise<void> {
  if (!running) return;
  const endAt = Date.now() + durationSec * 1000;
  const intervalMs = 1000 / concurrency;

  printPhaseHeader(name, concurrency, durationSec);

  while (Date.now() < endAt && running) {
    const batchStart = Date.now();
    const batchPromises: Promise<void>[] = [];

    for (let i = 0; i < concurrency; i++) {
      const delayMs = i * intervalMs;
      const p = sleep(delayMs).then(async () => {
        if (Date.now() < endAt && running) {
          const r = await fireRequest(name);
          results.push(r);
        }
      });
      batchPromises.push(p);
    }

    await Promise.all(batchPromises);

    const elapsed = Date.now() - batchStart;
    if (elapsed < 1000) await sleep(1000 - elapsed);
  }
}

// --- Live metrics display -----------------------------------------------------
let lastSnapshotCount = 0;

async function printLiveMetrics(): Promise<void> {
  let serverMetrics: Record<string, unknown> = {};
  try {
    const r = await fetch(METRICS_URL, { signal: AbortSignal.timeout(2000) });
    if (r.ok) serverMetrics = await r.json() as Record<string, unknown>;
  } catch { /* server might not be ready */ }

  const since = results.slice(lastSnapshotCount);
  lastSnapshotCount = results.length;

  const ok   = since.filter(r => r.status === 200).length;
  const rej  = since.filter(r => r.status === 429).length;
  const errs = since.filter(r => r.status === 0).length;
  const lats = since.map(r => r.latencyMs).sort((a, b) => a - b);
  const p50  = percentile(lats, 50).toFixed(0);
  const p99  = percentile(lats, 99).toFixed(0);
  const phase = results.at(-1)?.phase ?? '—';

  process.stdout.write(
    `\r[${new Date().toLocaleTimeString()}] Phase: ${phase.padEnd(10)} | ` +
    `OK:${String(ok).padStart(4)}  429:${String(rej).padStart(4)}  ERR:${String(errs).padStart(3)} | ` +
    `p50:${p50}ms  p99:${p99}ms | ` +
    `qDepth:${serverMetrics.queueDepth ?? '?'}  proc/s:${serverMetrics.messagesProcessedPerSec ?? '?'}` +
    '\x1b[K'
  );
}

// --- Final report -------------------------------------------------------------
function buildReport(): void {
  console.log('\n\n' + '='.repeat(70));
  console.log('  LOAD TEST REPORT');
  console.log('='.repeat(70));

  const phases = [...new Set(results.map(r => r.phase))];
  const allStats: Record<string, PhaseStats> = {};

  for (const phase of phases) {
    const subset = results.filter(r => r.phase === phase);
    const stats: PhaseStats = {
      total:     subset.length,
      ok200:     subset.filter(r => r.status === 200).length,
      rej429:    subset.filter(r => r.status === 429).length,
      errors:    subset.filter(r => r.status === 0).length,
      latencies: subset.map(r => r.latencyMs).sort((a, b) => a - b),
    };
    allStats[phase] = stats;

    const p50  = percentile(stats.latencies, 50).toFixed(1);
    const p95  = percentile(stats.latencies, 95).toFixed(1);
    const p99  = percentile(stats.latencies, 99).toFixed(1);
    const max  = (stats.latencies.at(-1) ?? 0).toFixed(1);
    const accP = ((stats.ok200 / stats.total) * 100).toFixed(1);
    const rejP = ((stats.rej429 / stats.total) * 100).toFixed(1);

    console.log(`\n  Phase: ${phase.toUpperCase()}`);
    console.log(`  ${'-'.repeat(45)}`);
    console.log(`  Total requests : ${stats.total}`);
    console.log(`  200 Accepted   : ${stats.ok200}  (${accP}%)`);
    console.log(`  429 Rejected   : ${stats.rej429}  (${rejP}%)  <- backpressure working`);
    console.log(`  Errors/timeout : ${stats.errors}`);
    console.log(`  Latency p50    : ${p50} ms`);
    console.log(`  Latency p95    : ${p95} ms`);
    console.log(`  Latency p99    : ${p99} ms`);
    console.log(`  Latency max    : ${max} ms`);
  }

  const allLats  = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const total200 = results.filter(r => r.status === 200).length;
  const total429 = results.filter(r => r.status === 429).length;
  const totalErr = results.filter(r => r.status === 0).length;

  console.log('\n' + '-'.repeat(70));
  console.log('  OVERALL SUMMARY');
  console.log('-'.repeat(70));
  console.log(`  Total fired    : ${results.length}`);
  console.log(`  Accepted (200) : ${total200}  (${((total200/results.length)*100).toFixed(1)}%)`);
  console.log(`  Rejected (429) : ${total429}  (${((total429/results.length)*100).toFixed(1)}%)`);
  console.log(`  Errors         : ${totalErr}  (${((totalErr/results.length)*100).toFixed(1)}%)`);
  console.log(`  p50 latency    : ${percentile(allLats, 50).toFixed(1)} ms`);
  console.log(`  p99 latency    : ${percentile(allLats, 99).toFixed(1)} ms`);
  console.log(`  Max latency    : ${(allLats.at(-1) ?? 0).toFixed(1)} ms`);
  console.log('='.repeat(70));

  const reportPath = `loadtest-report-${Date.now()}.json`;
  const fs = require('fs');
  fs.writeFileSync(reportPath, JSON.stringify({
    meta: {
      targetUrl:            ENDPOINT,
      timestamp:            new Date().toISOString(),
      rampConcurrency:      RAMP_CONCURRENCY,
      sustainedConcurrency: SUSTAINED_CONCURRENCY,
      spikeConcurrency:     SPIKE_CONCURRENCY,
      rampDurationS:        RAMP_DURATION_S,
      sustainedDurationS:   SUSTAINED_DURATION_S,
      spikeDurationS:       SPIKE_DURATION_S,
      cooldownDurationS:    COOLDOWN_DURATION_S,
    },
    summary: {
      totalFired: results.length,
      accepted:   total200,
      rejected:   total429,
      errors:     totalErr,
      p50Ms:      percentile(allLats, 50),
      p95Ms:      percentile(allLats, 95),
      p99Ms:      percentile(allLats, 99),
      maxMs:      allLats.at(-1) ?? 0,
    },
    phases: allStats,
  }, null, 2));

  console.log(`\n  Report saved -> ${reportPath}\n`);
}

function printPhaseHeader(name: string, concurrency: number, durationSec: number): void {
  console.log(`\n\n+${'-'.repeat(53)}+`);
  console.log(`| Phase: ${name.toUpperCase().padEnd(12)}  ${String(concurrency).padStart(4)} req/s  for ${durationSec}s`);
  console.log(`+${'-'.repeat(53)}+`);
}

// --- Main ---------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('  OrchestratedGateway — Load Test');
  console.log(`  Target : ${ENDPOINT}`);
  console.log(`  Phases : ramp(${RAMP_CONCURRENCY}/s x ${RAMP_DURATION_S}s)`
            + ` -> sustained(${SUSTAINED_CONCURRENCY}/s x ${SUSTAINED_DURATION_S}s)`
            + ` -> spike(${SPIKE_CONCURRENCY}/s x ${SPIKE_DURATION_S}s)`
            + ` -> cooldown(${RAMP_CONCURRENCY}/s x ${COOLDOWN_DURATION_S}s)`);
  console.log('='.repeat(70));

  // Verify the server is alive before starting
  try {
    const check = await fetch(`${TARGET_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!check.ok) throw new Error(`Health check returned ${check.status}`);
    console.log('\n  Server reachable — starting test...');
  } catch (err) {
    console.error(`\n  Cannot reach server at ${TARGET_URL}/health`);
    console.error(`  Make sure your server is running:  npm run dev`);
    process.exit(1);
  }

  const ticker = setInterval(() => { void printLiveMetrics(); }, 1000);

  process.on('SIGINT', () => {
    running = false;
    console.log('\n\n  Interrupted — building partial report...');
  });

  try {
    await runPhase('ramp-up',   RAMP_CONCURRENCY,     RAMP_DURATION_S);
    await runPhase('sustained', SUSTAINED_CONCURRENCY, SUSTAINED_DURATION_S);
    await runPhase('spike',     SPIKE_CONCURRENCY,     SPIKE_DURATION_S);
    await runPhase('cooldown',  RAMP_CONCURRENCY,      COOLDOWN_DURATION_S);
  } finally {
    running = false;
    clearInterval(ticker);
    await printLiveMetrics();
    buildReport();
  }
}

void main();
