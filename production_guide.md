# 🏭 Industry Production Practices — Orchestrated Gateway
> Everything a senior engineer would do before calling this "production-ready"

---

## 1. 📁 Git & GitHub Setup

### Branch Strategy (GitHub Flow — industry standard for solo/small teams)
```
main        ← always deployable, protected branch, never push directly
  └── feature/load-test-script
  └── feature/retry-logic
  └── fix/metrics-throughput-counter
  └── chore/wire-env-vars
```

**Rules:**
- `main` is the production branch — every commit on `main` triggers a deploy
- All work goes through Pull Requests, even if solo
- Branch names: `feature/`, `fix/`, `chore/`, `docs/`

### Commit Message Convention (Conventional Commits — used by Google, Angular, etc.)
```
feat: add retry logic with configurable MAX_RETRIES
fix: wire FAILURE_PROBABILITY env var into WorkerPool
chore: add GitHub Actions CI workflow
docs: update README with deployment instructions
refactor: replace Array.shift() with O(1) ring buffer
test: add load test script for 50/200/1000 concurrent requests
```
Format: `type: short description (imperative, lowercase, no period)`

### What to Add to `.gitignore`
Your current `.gitignore` is good. Add these:
```gitignore
# Large local files
mermaid.min.js

# Demo files (not part of the app)
demo.html
test_mermaid.html

# Railway local config
.railway/
```

---

## 2. 🔐 Environment & Secrets Management

### The Golden Rule
> **Never commit secrets or `.env` files to Git. Ever.**

### The `.env` File Setup
```
.env.example   ← commit this (template with no real values) ✅ already done
.env           ← NEVER commit this ✅ already in .gitignore
.env.local     ← NEVER commit this ✅ already in .gitignore
```

### In Production (Railway)
Set env vars in Railway's dashboard directly — never in files. The app reads them via `process.env.*` which you already do correctly.

### Environment Tiers (industry standard)
| Environment | Purpose | Where it runs |
|---|---|---|
| `development` | Your local machine | `npx tsx src/index.ts` |
| `staging` | Pre-production testing | Railway (separate project) |
| `production` | Real users | Railway (main project) |

Add `NODE_ENV` to your config:
```typescript
// src/config/env.ts
export const config = {
  env: process.env.NODE_ENV || 'development',
  // ... rest of config
};
```

---

## 3. 🛡️ Security Hardening (Production Must-Haves)

### Add `helmet` — HTTP Security Headers
```bash
npm install helmet
```
```typescript
// src/index.ts
import helmet from 'helmet';
app.use(helmet()); // sets X-Frame-Options, CSP, HSTS, etc. automatically
```

### Add Rate Limiting per IP
```bash
npm install express-rate-limit
```
```typescript
import rateLimit from 'express-rate-limit';
const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,             // 100 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/webhook', limiter);
```

### Validate Request Bodies
Don't blindly accept any JSON. Add basic validation:
```typescript
app.post('/webhook', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  // ... rest of handler
});
```

### Set Request Size Limit
```typescript
app.use(express.json({ limit: '100kb' })); // prevent giant payload attacks
```

---

## 4. 📊 Structured Logging (Not `console.log`)

Industry uses structured JSON logs that are searchable in log aggregators.

```bash
npm install pino pino-pretty
npm install --save-dev @types/pino
```

```typescript
// src/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,  // in production, output raw JSON for log aggregators
});
```

Then replace all `console.log(...)` with:
```typescript
logger.info({ msgId: msg.id, source: msg.source }, 'Webhook received');
logger.warn({ queueDepth: queue.depth() }, 'Queue full, rejecting request');
logger.error({ err, msgId: item.id }, 'Worker failed to process message');
```

**Why**: Log aggregators (Datadog, Papertrail, Railway logs) can parse JSON logs and let you filter by `msgId`, `source`, `err`, etc. `console.log` strings are unsearchable.

---

## 5. ❤️ Health Check Endpoint

Every production service needs a `/health` or `/healthz` endpoint. Load balancers and deployment platforms ping it to know if the service is alive.

```typescript
// src/index.ts
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
  });
});
```

Railway will use this for health checks during deployments.

---

## 6. ⚙️ Graceful Shutdown

When Railway restarts your app (deploy, crash), it sends `SIGTERM`. Without handling it, in-flight requests get killed mid-process. Industry standard: drain the queue and finish current work before exiting.

```typescript
// src/index.ts
const server = app.listen(PORT, () => logger.info(`Server on port ${PORT}`));

function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, draining...');
  workerPool.stop();
  server.close(() => {
    logger.info('Server closed. Exiting.');
    process.exit(0);
  });
  // Force exit after 10s if drain takes too long
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

---

## 7. 🚀 CI/CD with GitHub Actions

Every push to `main` should automatically: type-check → build → deploy.

### Create `.github/workflows/deploy.yml`
```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Type Check & Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci   # ci is stricter than npm install — uses package-lock.json exactly

      - name: Type check
        run: npm run typecheck

      - name: Build
        run: npm run build

  deploy:
    name: Deploy to Railway
    runs-on: ubuntu-latest
    needs: ci                          # only deploy if CI passes
    if: github.ref == 'refs/heads/main'  # only on main branch pushes
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        uses: bervProject/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: orchestrated-gateway
```

**Key point**: `npm ci` vs `npm install` — `ci` installs EXACTLY what's in `package-lock.json`, no surprise version bumps in production.

---

## 8. 🚂 Railway Deployment (Proper Setup)

### Step 1: Create `railway.json` in project root
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node dist/index.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**Why `node dist/index.js` not `npx tsx src/index.ts`**: In production you run compiled JS, not TypeScript source. `tsx` is a dev tool — it's slower and not meant for production.

### Step 2: Add a `build` script that Railway will run
Your `package.json` already has `"build": "tsc"` ✅. Railway automatically runs `npm run build` before starting.

### Step 3: Set Environment Variables in Railway Dashboard
```
NODE_ENV=production
PORT=3000              (Railway may override this automatically)
QUEUE_CAPACITY=500     (higher than dev default)
WORKER_COUNT=8         (more workers in prod)
LOG_LEVEL=info
```

### Step 4: Get Railway token for GitHub Actions
Railway dashboard → Account Settings → Tokens → Create token → add as `RAILWAY_TOKEN` in GitHub repo secrets.

---

## 9. 📦 `package.json` Scripts (Production Standard)

```json
{
  "scripts": {
    "dev":        "tsx watch src/index.ts",
    "build":      "tsc",
    "start":      "node dist/index.js",
    "typecheck":  "tsc --noEmit",
    "lint":       "eslint src/**/*.ts",
    "test":       "node --test dist/**/*.test.js",
    "loadtest":   "npx tsx src/loadtest.ts"
  }
}
```

**Note**: `start` now runs `node dist/index.js` (compiled), not `npx tsx`. `dev` uses `tsx watch` for hot-reload during development.

---

## 10. 📝 README.md (Every Serious Repo Has One)

```markdown
# Orchestrated Gateway

A Node.js webhook gateway with backpressure protection.

## Architecture
POST /webhook → Bounded Queue → Worker Pool → Processed Store
                                           ↘ Dead Letter Store (5% fail)

## Local Development
\`\`\`bash
cp .env.example .env
npm install
npm run dev
\`\`\`

## API
| Endpoint | Method | Description |
|---|---|---|
| /webhook | POST | Accept webhook, enqueue |
| /health | GET | Health check |
| /metrics | GET | System state |
| /dead-letters | GET | Failed messages |

## Environment Variables
See `.env.example` for all supported variables.

## Deployment
Deployed on Railway. Push to `main` triggers automatic deployment via GitHub Actions.
```

---

## 11. 🔢 Semantic Versioning

Tag releases properly:
```bash
git tag -a v1.0.0 -m "v1.0.0: Initial production release"
git push origin v1.0.0
```

Format: `MAJOR.MINOR.PATCH`
- `PATCH` — bug fix
- `MINOR` — new feature, backwards compatible
- `MAJOR` — breaking change

---

## 📋 Production Deployment Checklist

Before you call anything "in production", tick all of these:

### Code Quality
- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm run build` compiles successfully
- [ ] No hardcoded secrets in code
- [ ] All `console.log` replaced with structured logger (pino)
- [ ] `helmet` added
- [ ] Rate limiting added
- [ ] Request size limit set (`100kb`)
- [ ] `GET /health` endpoint added
- [ ] Graceful shutdown (`SIGTERM`) handled

### Git / GitHub
- [ ] `main` branch protected (require PR + status checks to merge)
- [ ] `.env` is in `.gitignore` ✅
- [ ] `mermaid.min.js` in `.gitignore`
- [ ] Conventional commit messages
- [ ] `README.md` written

### CI/CD
- [ ] `.github/workflows/deploy.yml` created
- [ ] `RAILWAY_TOKEN` added to GitHub repo secrets
- [ ] CI runs typecheck + build on every PR
- [ ] Deploy only triggers on `main` branch, only if CI passes

### Railway
- [ ] `railway.json` created with health check config
- [ ] `start` script uses `node dist/index.js` (not `tsx`)
- [ ] `NODE_ENV=production` set in Railway dashboard
- [ ] Health check endpoint confirmed working
- [ ] Service shows green in Railway dashboard

### Remaining Code Gaps
- [ ] Wire `FAILURE_PROBABILITY`, `PROCESSING_DELAY_MS`, `MAX_RETRIES` env vars
- [ ] Implement retry logic in `WorkerPool`
- [ ] Real throughput counter in `/metrics`
- [ ] Load test script written and baseline recorded
