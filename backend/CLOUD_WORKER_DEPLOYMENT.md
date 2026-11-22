# RGPV Cloud Worker Deployment

The API and browser worker are separate Render services. The API queues jobs; the background worker runs the existing Playwright/Tesseract result-fetching code. The frontend never receives MongoDB credentials or the worker secret.

## 1. Deploy or update the API service

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Keep the existing `MONGODB_URI`, `FRONTEND_URL`, and other API environment variables.
- Add `WORKER_SHARED_SECRET` as a long random secret. Use the exact same value on the worker service.
- The API service should not run Chromium for fetch jobs after this change.

## 2. Create a separate Render Background Worker

Use the same repository and branch, but create a **Background Worker** service:

- Branch: `cloud-worker-architecture` (after merging the pull request, use `main`)
- Root Directory: `backend`
- Build Command: `npm install && PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`
- Start Command: `npm run worker`

Set these environment variables on the worker:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Same Atlas connection string used by API |
| `BACKEND_URL` | `https://YOUR-API-SERVICE.onrender.com` |
| `WORKER_SHARED_SECRET` | Exactly the same secret as API |
| `WORKER_ID` | A unique stable name, e.g. `rgpv-worker-1` |
| `MAX_PARALLEL_TABS` | `100` (maximum cap) |
| `DEVICE_EXECUTION_POLICY` | `adaptive` |
| `PLAYWRIGHT_BROWSERS_PATH` | `0` |

Choose a worker instance with enough RAM and CPU for Chromium plus OCR. The adaptive policy calculates a lower tab concurrency from the container memory limit and CPU count; the configured 100 is a ceiling, not a promise that 100 tabs fit on every instance. The smallest 512 MB instances are not suitable for this browser workload.

## 3. MongoDB Atlas

Allow the worker service to connect to Atlas. Use a database user with only the access required by this application. Never place `MONGODB_URI` or `WORKER_SHARED_SECRET` in Vercel frontend variables.

## 4. Operational behavior

- Users create, pause, resume, cancel, and monitor jobs from the Vercel website.
- The API dispatches queued jobs to connected workers over authenticated Socket.IO.
- Worker progress, tab state, logs, and CAPTCHA-required notifications are relayed to the website.
- The worker writes student results directly to Atlas using the existing models and job processor.
- If the worker process restarts, it re-queues its own interrupted running jobs so completed student records are skipped on resume.

## 5. Scaling

Each worker service runs one browser job at a time. Add more background worker instances with unique `WORKER_ID` values to process multiple jobs concurrently. Capacity for tabs within each worker remains adaptive and is limited by its configured maximum and machine resources.
