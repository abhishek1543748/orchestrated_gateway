# 1. Start your server first (separate terminal)
npm run dev

# 2. In another terminal — run the default test
npm run loadtest

# 3. Bigger spike
npm run loadtest:spike

# 4. Against your deployed Railway URL
$env:TARGET_URL = "https://your-app.railway.app"; npx tsx loadtest.ts

# 5. Fully custom
npx tsx loadtest.ts --concurrency=500 --duration=30 --spike-concurrency=3000 --spike-duration=8
