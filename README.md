# Bug Report Court

Paste a software defect report and a rule-based judge returns a verdict: a 0–10 score, the charges (what is missing), a humorous sentence and a corrected report template. No external AI API is used.

## Stack

- Node.js 20+ and Express: one service that serves the API and the static frontend
- PostgreSQL via `pg`, connected with `DATABASE_URL`
- Vanilla HTML/CSS/JS frontend in `public/`, no build step
- Unit tests with the built-in `node:test` runner

```
src/server.js         Express API + static hosting
src/judge/engine.js   Rule-based judging engine (pure functions)
src/db/migrate.js     Migrations + idempotent seed (runs on every start)
data/*.csv            Seed data: sample reports and verdict lines
test/                 Engine unit tests
public/               Frontend
```

## Deploying to Railway

1. In Railway, create a new project and choose **Deploy from GitHub repo**, then pick this repository (`main` branch).
2. In the same project, click **+ New → Database → PostgreSQL**.
3. Open the app service, go to **Variables** and add `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
4. Go to **Settings → Networking** and click **Generate Domain** to get the public URL.

Every push to `main` deploys automatically. `railway.json` sets the build command (`npm run build`, which runs the unit tests) and the start command (`npm start`). On start the server runs the migrations and the idempotent seed. If the database is not reachable, the UI shows a friendly error and the server keeps retrying.

## Running locally (optional)

```bash
cp .env.example .env   # set DATABASE_URL to a PostgreSQL database
npm install
DATABASE_URL=postgresql://... npm start
npm test
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness check plus database status |
| GET/POST | `/api/judges` | List or create judges |
| PUT/DELETE | `/api/judges/:id` | Edit or delete a judge |
| GET/POST | `/api/cases` | List cases or create a case (court, judgeId, sarcasm, strictness) |
| GET/PATCH/DELETE | `/api/cases/:id` | Case with its messages, update settings, delete |
| POST | `/api/cases/:id/messages` | Submit a report `{text, attachmentName}` and get the verdict |
| GET | `/api/samples/random` | Random sample report |
| GET/POST | `/api/hall` | Top 10 / bottom 10, or submit a verdict `{messageId}` |

## Scoring rules

Points (max 10): title 1, steps 2 (1 per step), expected 1.5, actual 1.5, environment 1, severity/priority 1, evidence 1, test data/preconditions 1.
Penalties: vague phrases −0.5 each (max −2), >30% uppercase −1, `!!!` −0.5, several defects −1. Penalties are multiplied by the Strictness factor (×0.5–×1.5) and then capped at −3. The score never goes below 0.
Section keywords are recognised in English and Estonian.
