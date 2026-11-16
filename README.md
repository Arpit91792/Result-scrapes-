# RGPV Smart Bulk Result Manager

A full-stack web application for fetching, analyzing, and exporting RGPV university examination results for entire college batches.

## ⚠️ Important Legal & Ethical Notice

- This tool interacts only with **publicly available, authorized** RGPV result sources.
- **CAPTCHA challenges are NEVER automatically bypassed.** Users must complete them manually.
- Generated Excel and PDF files are **reference documents only** — not official university documents.
- Use **Demo Mode** for testing without accessing the live portal.
- Unauthorized bulk scraping may violate RGPV's terms of service.

---

## Project Structure

```
SIRT RESULT/
├── backend/          Node.js + Express + MongoDB + Socket.IO
│   ├── src/
│   │   ├── models/   Mongoose schemas
│   │   ├── routes/   REST API routes
│   │   ├── services/ Business logic (fetcher, Excel, PDF)
│   │   ├── socket/   Socket.IO handlers
│   │   ├── middleware/ Auth middleware
│   │   └── utils/    Logger, enrollment generator
│   └── .env          Environment config
└── frontend/         React + Vite + Tailwind CSS
    └── src/
        ├── pages/    All page components
        ├── components/ Layout (Sidebar, Header)
        ├── contexts/ Auth & Theme contexts
        └── services/ API client & Socket.IO
```

---

## Setup & Running

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- npm

### Backend

```bash
cd backend
cp .env.example .env        # Edit MONGODB_URI and JWT_SECRET
npm install
npm run dev                 # Starts on port 5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                 # Starts on port 5173
```

Open `http://localhost:5173` in your browser.

---

## Key Features

| Feature | Status |
|---------|--------|
| Enrollment number generator | ✅ Fully working |
| CSV/Excel enrollment upload | ✅ Fully working |
| Demo mode with sample data | ✅ Fully working |
| Live progress via Socket.IO | ✅ Fully working |
| Pause / Resume / Cancel jobs | ✅ Fully working |
| Excel export (multi-sheet) | ✅ Fully working |
| PDF individual reports | ✅ Fully working |
| ZIP archive export | ✅ Fully working |
| JWT authentication | ✅ Fully working |
| Dark / Light theme | ✅ Fully working |
| Live RGPV portal fetching | ⚠️ Requires portal inspection |

---

## Live Portal Integration

The file `backend/src/services/resultFetcher.js` contains the Playwright automation scaffold.

**Before enabling live fetching:**

1. Open `https://result.rgpv.ac.in/` in a browser
2. Use DevTools (F12) to identify:
   - Programme/Course select element
   - Enrollment number input field
   - Semester select element
   - Grade mode select element
   - CAPTCHA element (if present)
   - Submit button
3. Update the placeholder selectors in `resultFetcher.js`
4. Test with a single enrollment number before bulk operations

---

## API Reference

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |
| POST | `/api/results/generate-enrollments` | Generate enrollment list |
| POST | `/api/results/upload-enrollments` | Upload CSV/Excel |
| POST | `/api/results/start-fetch` | Start fetch job |
| GET | `/api/results/job/:id` | Job status |
| POST | `/api/results/job/:id/pause` | Pause job |
| POST | `/api/results/job/:id/resume` | Resume job |
| POST | `/api/results/job/:id/cancel` | Cancel job |
| GET | `/api/results/job/:id/students` | Student results |
| GET | `/api/results/student/:id` | Single student |
| GET | `/api/results/export/:id/excel` | Export Excel |
| GET | `/api/results/export/:id/pdf/:sid` | Export PDF |
| GET | `/api/results/export/:id/zip` | Export ZIP |
| GET | `/api/results/jobs` | All user jobs |
| GET | `/api/results/download-history` | Download history |

---

## Deployment

- **Frontend**: Vercel — `vercel deploy` from `frontend/`
- **Backend**: Render — connect GitHub, set environment variables
- **Database**: MongoDB Atlas — update `MONGODB_URI` in backend `.env`
- **Playwright**: Use a persistent Node.js instance; check browser dependency requirements on host

---

## Demo Mode

Enable **Demo Mode** on the Fetch Results page to test the entire workflow with realistic sample data, without accessing the live RGPV portal. All demo records are clearly marked with `[DEMO]` labels.
