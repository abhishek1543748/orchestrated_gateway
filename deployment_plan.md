# Deploy: Railway (Backend) + Vercel (Frontend)

## Overview

| Layer | Platform | What it runs |
|---|---|---|
| Backend | **Railway** | Express + TypeScript (`src/index.ts`) |
| Frontend | **Vercel** | Vite + React (`my-console/`) |

> [!IMPORTANT]
> **The backend is fully in-memory** — `InMemoryQueue`, `ProcessedStore`, and `DeadLetterStore` hold no persistent disk state. Railway is a perfect fit: it's a stateful container host (not serverless), so the process stays alive and the in-memory data survives between requests. ✅

---

## ⚠️ One Critical Issue to Resolve First

> [!CAUTION]
> **In-memory state resets on every deploy/restart.** Railway restarts your container on each new deploy, and the queue/processed/dead-letter stores are wiped. This is fine for a demo, but something to be aware of. No action needed unless you want persistence across restarts (which would require a DB like Redis).

---

## Files to Create/Modify

### 1. Backend — `railway.toml` (NEW)
Tells Railway how to build and start the backend.

#### [NEW] `railway.toml` (root)
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm run build && npm start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

---

### 2. Backend — `nixpacks.toml` (NEW)
Pins the Node version explicitly for Railway's Nixpacks builder.

#### [NEW] `nixpacks.toml` (root)
```toml
[phases.setup]
nixPkgs = ["nodejs_20"]
```

---

### 3. Backend — Environment Variables (set in Railway dashboard)

| Variable | Value |
|---|---|
| `PORT` | `3000` (Railway injects this automatically — no need to set) |
| `HOST` | `0.0.0.0` |
| `ALLOWED_ORIGIN` | `https://your-project.vercel.app` ← set after Vercel deploy |
| `QUEUE_CAPACITY` | `100` |
| `WORKER_COUNT` | `4` |
| `WORKER_POLL_INTERVAL_MS` | `100` |
| `PROCESSING_DELAY_MS` | `50` |
| `FAILURE_PROBABILITY` | `0.1` |
| `MAX_RETRIES` | `3` |

> [!NOTE]
> Railway **automatically** sets `PORT` for you — your code already reads `process.env.PORT` correctly (line 117 of `index.ts`). No change needed.

---

### 4. Frontend — `vercel.json` (NEW)
Tells Vercel the build root is `my-console/` and sets up SPA routing.

#### [NEW] `vercel.json` (root of repo)
```json
{
  "buildCommand": "cd my-console && npm install && npm run build",
  "outputDirectory": "my-console/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

### 5. Frontend — Environment Variable (set in Vercel dashboard)

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://your-project.up.railway.app` ← from Railway after deploy |

> [!IMPORTANT]
> After you deploy the backend to Railway, copy the public URL it gives you and paste it as `VITE_API_URL` in Vercel. Then redeploy the frontend.

---

## Proposed Changes (Summary)

### Backend (root of repo)
#### [NEW] [`railway.toml`](file:///c:/Users/BIT/Desktop/orchestratedGateway/railway.toml)
#### [NEW] [`nixpacks.toml`](file:///c:/Users/BIT/Desktop/orchestratedGateway/nixpacks.toml)

### Frontend
#### [NEW] [`vercel.json`](file:///c:/Users/BIT/Desktop/orchestratedGateway/vercel.json)

No changes to source code are needed — everything is already wired correctly.

---

## Step-by-Step Deploy Instructions

### Part 1 — Deploy Backend to Railway

1. Push your repo to GitHub (if not already done).
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select your repo (`orchestratedGateway`).
4. Railway auto-detects Node. It will use `railway.toml` for the start command.
5. Go to **Variables** tab and add the env vars from the table above.
   - Leave `PORT` unset — Railway provides it automatically.
   - Set `ALLOWED_ORIGIN` to `*` temporarily until you have the Vercel URL.
6. Click **Deploy**. Wait for `/health` to return `200`.
7. Copy the **Railway public URL** (e.g., `https://orchestratedgateway-production.up.railway.app`).

### Part 2 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import your GitHub repo.
2. Set **Framework Preset** to `Vite`.
3. Set **Root Directory** to `my-console`.
4. Under **Environment Variables**, add:
   - `VITE_API_URL` = `https://<your-railway-url>`
5. Click **Deploy**.
6. Copy the **Vercel URL** (e.g., `https://my-console.vercel.app`).

### Part 3 — Wire CORS

1. Go back to Railway → **Variables**.
2. Update `ALLOWED_ORIGIN` from `*` to your exact Vercel URL: `https://my-console.vercel.app`.
3. Railway will automatically redeploy.

---

## Verification Plan

### Automated
- Railway health check: `GET /health` → `{ status: 'ok' }`

### Manual
- Open Vercel URL in browser → frontend loads.
- Send a test webhook: `POST https://<railway-url>/webhook` with `{"source":"test","payload":{"hello":"world"}}`.
- Check `GET /metrics` shows `processedTotal` incrementing.
- Check `GET /dead-letters` returns the dead-letter queue state.
- Verify the React console UI shows live metrics.

---

## Open Questions

None — the project is fully ready for this deployment strategy. No source code changes required.
