# SOP: Reviewing & Deploying an Express.js Backend Repo (No UI/React yet)

**Purpose:** Standard steps to take when handed a GitHub link to an Express-only backend repo, to (1) understand it, (2) run it locally, and (3) deploy it.

**Audience:** For Gemini (or any assistant) to follow when given repo access.

---

## Phase 1 — Repo Reconnaissance

1. **Fetch the repo root** — confirm it loads, check visibility (public/private), default branch, last commit date.
2. **Read `README.md`** if present — note any existing setup instructions, don't skip even if brief.
3. **Read `package.json`**:
   - `scripts` block (`start`, `dev`, `build`, `test`) — this tells you the actual run commands, don't guess.
   - `dependencies` vs `devDependencies` — confirm Express version, and flag any DB drivers (mongoose, pg, mysql2), auth libs (jsonwebtoken, passport), or other services implied.
   - `engines` field — Node version pinning.
4. **Locate the entry point** (`index.js`, `server.js`, `app.js` — check `main` field in package.json to be sure). Read it fully:
   - Which port does it listen on?
   - What middleware is loaded (cors, helmet, body-parser/express.json, morgan, etc.)?
   - Is there a central router file or are routes inline?
5. **Check for `.env.example` or `.env.sample`** — list every required environment variable. If none exists, grep the codebase for `process.env.` to reverse-engineer the required vars.
6. **Check for a database/ORM config** (`/config`, `/models`, `prisma/schema.prisma`, `mongoose.connect`, etc.) — note whether local run requires an external DB or if there's a Docker Compose / local fallback.
7. **Check for `Dockerfile` or `docker-compose.yml`** — if present, that becomes the preferred run/deploy path.
8. **List all routes** — walk `/routes` or `/controllers` folder, or grep for `router.get/post/put/delete` and `app.get/post/...`. Produce a short route map (method, path, purpose).
9. **Check `.gitignore`** — confirm `.env`, `node_modules`, and any secrets are excluded (flag if not, as a security note).
10. **Check for tests** (`/test`, `/__tests__`, `jest`/`mocha` in devDependencies) and a `.github/workflows` folder (existing CI/CD — reuse it if there, don't reinvent).

---

## Phase 2 — Running It Locally (Checklist)

- [ ] Confirm Node version matches `engines` (use `nvm use` if `.nvmrc` present)
- [ ] `git clone <repo-url>`
- [ ] `cd` into repo
- [ ] `npm install` (or `yarn` / `pnpm install` — check for lockfile type first)
- [ ] Copy `.env.example` → `.env`, fill in real values (ask user for secrets, never invent them)
- [ ] Start any required external services (DB, Redis) locally or via Docker Compose
- [ ] Run the start command found in `package.json` (`npm run dev` if nodemon is present, else `npm start`)
- [ ] Confirm server boots without error, note the port
- [ ] Hit a basic route with `curl` or Postman/Thunder Client to confirm a 200 response
- [ ] Test 2–3 more representative endpoints from the route map (Phase 1, step 8)
- [ ] Check logs for warnings (deprecated packages, missing env vars, DB connection issues)

---

## Phase 3 — Deployment Plan of Action

**Step 1: Pick a target based on repo needs**
| Situation | Recommended platform |
|---|---|
| Simple Express API, no/managed DB | Render, Railway, Fly.io |
| Needs a DB and want it bundled | Railway (Postgres/MySQL/Redis add-ons) |
| Want serverless / free tier at scale | Vercel (with `vercel.json` rewrites) or AWS Lambda via Serverless Framework |
| Already has a Dockerfile | Fly.io, Render (Docker deploy), or any container host |

**Step 2: Pre-deploy checklist**
- [ ] Ensure `PORT` is read from `process.env.PORT` (not hardcoded) — required by most PaaS
- [ ] Add a `Procfile` or confirm `start` script works standalone (`npm start`)
- [ ] Add `.env` variables to the platform's dashboard/secrets manager — never commit them
- [ ] Add a `.dockerignore`/`.gitignore` sanity check (no `node_modules`, no `.env` pushed)
- [ ] Set `NODE_ENV=production`
- [ ] Confirm CORS config allows the eventual frontend origin (relevant later once React UI is added)
- [ ] Add a health-check route (`GET /health` returning 200) if not present — most platforms want this

**Step 3: Deploy**
- [ ] Connect GitHub repo to chosen platform (OAuth-based, one click for Render/Railway/Fly)
- [ ] Configure build command (`npm install`) and start command (`npm start`)
- [ ] Set environment variables in platform dashboard
- [ ] Trigger first deploy, watch build logs for errors
- [ ] Hit the deployed health-check/base route to confirm it's live
- [ ] Test 1–2 real endpoints against the live URL

**Step 4: Post-deploy**
- [ ] Set up auto-deploy on push to `main` (usually default on these platforms)
- [ ] Note the live URL and add it to the repo README
- [ ] (Optional) Add uptime monitoring (UptimeRobot, Better Uptime — free tier)

---

## What I'd Report Back to the User

1. A route map (what the API actually does)
2. Exact local run commands + required env vars
3. Any red flags (missing `.env.example`, hardcoded secrets, hardcoded port, no `.gitignore` coverage)
4. A specific deployment platform recommendation (not generic — based on what the repo actually needs)
5. Exact deploy steps + the live URL once done
