# Project: Concurrent Webhook Gateway

## One-line description
A backend service that accepts incoming webhooks over HTTP, buffers them in a bounded queue, and processes them via a separate worker pool — built to demonstrate backpressure handling under load, not to be feature-complete.

## Core concept the project must prove
The HTTP layer that *receives* work must never be the same thing that *does* the work. Receiving is fast and must never block. Processing is slow and must never block receiving. A bounded queue sits between them and enforces a decision (reject vs accept) when work arrives faster than it can be processed.

## Tech stack
- Runtime: Node.js + TypeScript
- HTTP framework: Express
- Queue backing store: in-memory (v1) → Redis (v2, same interface)
- Hosting: Railway
- Load testing: custom Node script or `autocannon`

## Components

### 1. HTTP layer
- Single route: `POST /webhook`
- Responsibilities: accept raw JSON body, normalize into unified schema (below), call `queue.enqueue()`, return immediately.
- If `queue.isFull()` → respond `429` with a short JSON error body. Never blocks waiting for space.
- Does NOT process the message itself. Does NOT call any business logic directly.

### 2. Queue (interface-first design)
Define as a TypeScript interface so the backing store can be swapped without touching any other component:
```ts
interface Queue<T> {
  enqueue(item: T): boolean;   // false if full
  dequeue(): T | undefined;
  depth(): number;
  isFull(): boolean;
}
```
- v1 implementation: fixed-capacity in-memory ring buffer or capped array.
- v2 implementation: same interface, backed by Redis (e.g. a Redis list with LPUSH/RPOP), swapped in without changing the worker pool or HTTP layer code.
- Capacity is a fixed number set at startup, not unbounded.

### 3. Worker pool
- N async workers (N configurable, small number like 4-8) running independently of the HTTP request lifecycle — e.g. a `setInterval`/loop-based puller, not tied to any single request.
- Each worker: dequeues one item, processes it (simulated work is fine for v1 — a delay + random chance of failure is enough to test the system), then routes to success or failure path.
- On success: write to processed store (see below), ack (remove from queue permanently — already implicit in dequeue).
- On failure: retry up to a small fixed count (e.g. 3), then move to dead-letter list. Do not build a full retry/backoff system — this is a minor supporting feature, not the main axis.

### 4. Processed store
- Minimal — records message IDs that have completed successfully.
- Used for idempotency: if a webhook with the same `(source, id)` pair arrives again, detect and skip reprocessing.

### 5. Dead-letter list
- Minimal — records messages that failed processing repeatedly, with reason.
- Exposed via a simple `GET /dead-letters` endpoint for inspection.

### 6. Metrics endpoint
- `GET /metrics` — returns current state as JSON (Prometheus format is a nice-to-have, not required):
  - `queueDepth`
  - `messagesInPerSec`
  - `messagesProcessedPerSec`
  - `failureCount`
  - `deadLetterCount`
- Reads from the queue and worker pool state. Does not sit in the request-processing path — it's read-only observation.

## Data flow (text form)
```
Sender --POST /webhook--> HTTP layer --enqueue()--> Queue
                                                        |
                                                    dequeue()
                                                        v
                                                  Worker pool
                                                   /        \
                                             success       fail x3
                                                |              |
                                        Processed store   Dead-letter list

Metrics endpoint reads Queue + Worker pool state independently, on demand.
```

## Unified message schema
```ts
interface IncomingMessage {
  source: string;       // e.g. "generic-webhook"
  id: string;            // for idempotency checks
  receivedAt: string;    // ISO timestamp
  payload: unknown;      // original JSON body, unmodified
}
```

## Explicit non-goals for v1 (do not build these)
- Multiple ingestion channels (Discord, Slack, email, etc.) — one HTTP webhook route only.
- Authentication/authorization on the webhook route.
- Full retry-with-exponential-backoff system.
- A frontend UI.

## Backpressure policy (decided, do not re-litigate)
When the queue is full, reject new messages with `HTTP 429` immediately. Do not block the sender and do not silently drop the oldest queued item. This is a deliberate choice — it makes failure visible to the caller and matches standard webhook-sender retry conventions (e.g. Stripe/GitHub already expect and retry on 429).

---

## Weekend 1 — compressed task list

Goal: a deployed, working `POST /webhook` endpoint that processes messages synchronously (no queue yet), plus a script that proves it degrades under concurrent load.

1. `npm init -y && npm install express typescript tsx @types/node @types/express && npx tsc --init`
2. Create `src/index.ts`:
   - Express instance with `express.json()` middleware for parsing JSON bodies
   - `POST /webhook` route: parse JSON body, build an `IncomingMessage` object, `console.log` it, process synchronously (a `sleep(50ms)` stand-in is fine — no real work exists yet), return `200`.
3. Run locally with `npx tsx src/index.ts`. Test with `curl -X POST localhost:3000/webhook -H "Content-Type: application/json" -d '{"hello":"world"}'`.
4. Deploy this bare version to Railway now, before adding anything else.
5. Write a small script (`loadtest.ts` or similar) that fires 50, then 200, then 1000 concurrent `POST /webhook` requests using `Promise.all` + `fetch`.
6. Run it against the deployed (or local) instance. Record what actually happens — response latency, whether requests time out, memory behavior. This observation becomes the "before" half of the project's story, referenced again in weekend 2 once the queue exists.

Do not build the queue, worker pool, or metrics endpoint in weekend 1. The synchronous version failing (or degrading) under load is the intended and necessary outcome of this weekend.
