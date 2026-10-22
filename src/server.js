const path = require('path');
const express = require('express');
const { types } = require('pg');
const { pool } = require('./db/pool');
const { migrateAndSeed } = require('./db/migrate');
const { judgeReport, sarcasmTone, pickSentence, COURTS } = require('./judge/engine');

// Return NUMERIC columns as JS numbers instead of strings.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

const PORT = process.env.PORT || 3000;
const MAX_REPORT_LENGTH = 5000;
const DB_DOWN_MESSAGE = 'The courthouse archive (database) is not reachable right now. Please try again in a moment.';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

let dbReady = false;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const q = (text, params) => pool.query(text, params);

function toId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id.');
  return n;
}

function toSlider(value, field) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new HttpError(400, `${field} must be between 0.0 and 1.0.`);
  return Math.round(n * 10) / 10;
}

function cleanText(value, field, max, required = false) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (required && !s) throw new HttpError(400, `${field} is required.`);
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return s;
}

function mapCase(r) {
  return {
    id: r.id,
    title: r.title,
    court: r.court,
    judgeId: r.judge_id,
    sarcasm: r.sarcasm,
    strictness: r.strictness,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapMessage(r) {
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    attachmentName: r.attachment_name,
    score: r.score,
    verdict: r.verdict,
    details: r.details,
    inHall: Boolean(r.in_hall),
    createdAt: r.created_at,
  };
}

function mapJudge(r) {
  return { id: r.id, name: r.name, tone: r.tone, intro: r.intro };
}

// ---- Health (always answers, so Railway's health check passes even if the DB is down) ----
app.get('/api/health', async (req, res) => {
  let db = false;
  if (pool) {
    try {
      await q('SELECT 1');
      db = dbReady;
    } catch {
      db = false;
    }
  }
  res.json({ ok: true, db });
});

// Every other API route needs a working database.
app.use('/api', (req, res, next) => {
  if (!pool || !dbReady) return res.status(503).json({ error: DB_DOWN_MESSAGE });
  next();
});

// ---- Judges ----
app.get('/api/judges', wrap(async (req, res) => {
  const { rows } = await q('SELECT * FROM judges ORDER BY id');
  res.json(rows.map(mapJudge));
}));

function judgeInput(body) {
  return {
    name: cleanText(body.name, 'Name', 60, true),
    tone: cleanText(body.tone, 'Tone description', 300),
    intro: cleanText(body.intro, 'Intro line', 300),
  };
}

app.post('/api/judges', wrap(async (req, res) => {
  const j = judgeInput(req.body || {});
  const { rows } = await q('INSERT INTO judges (name, tone, intro) VALUES ($1, $2, $3) RETURNING *', [j.name, j.tone, j.intro]);
  res.status(201).json(mapJudge(rows[0]));
}));

app.put('/api/judges/:id', wrap(async (req, res) => {
  const j = judgeInput(req.body || {});
  const { rows } = await q('UPDATE judges SET name = $2, tone = $3, intro = $4 WHERE id = $1 RETURNING *', [toId(req.params.id), j.name, j.tone, j.intro]);
  if (!rows.length) throw new HttpError(404, 'Judge not found.');
  res.json(mapJudge(rows[0]));
}));

app.delete('/api/judges/:id', wrap(async (req, res) => {
  const { rowCount } = await q('DELETE FROM judges WHERE id = $1', [toId(req.params.id)]);
  if (!rowCount) throw new HttpError(404, 'Judge not found.');
  res.status(204).end();
}));

// ---- Cases ----
app.get('/api/cases', wrap(async (req, res) => {
  const { rows } = await q('SELECT * FROM cases ORDER BY updated_at DESC, id DESC LIMIT 200');
  res.json(rows.map(mapCase));
}));

function caseSettings(body, partial) {
  const s = {};
  if (body.court !== undefined || !partial) {
    const court = body.court === undefined ? 'district' : body.court;
    if (!COURTS[court]) throw new HttpError(400, 'Unknown court.');
    s.court = court;
  }
  if (body.judgeId !== undefined) s.judge_id = body.judgeId === null ? null : toId(body.judgeId);
  const sarcasm = toSlider(body.sarcasm, 'Sarcasm');
  const strictness = toSlider(body.strictness, 'Strictness');
  if (sarcasm !== undefined) s.sarcasm = sarcasm;
  if (strictness !== undefined) s.strictness = strictness;
  return s;
}

async function assertJudgeExists(judgeId) {
  if (judgeId === null || judgeId === undefined) return;
  const { rowCount } = await q('SELECT 1 FROM judges WHERE id = $1', [judgeId]);
  if (!rowCount) throw new HttpError(400, 'Selected judge does not exist.');
}

app.post('/api/cases', wrap(async (req, res) => {
  const s = caseSettings(req.body || {}, false);
  await assertJudgeExists(s.judge_id);
  const { rows } = await q(
    'INSERT INTO cases (court, judge_id, sarcasm, strictness) VALUES ($1, $2, COALESCE($3, 0.5), COALESCE($4, 0.5)) RETURNING *',
    [s.court, s.judge_id ?? null, s.sarcasm ?? null, s.strictness ?? null]
  );
  res.status(201).json(mapCase(rows[0]));
}));

app.get('/api/cases/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const c = await q('SELECT * FROM cases WHERE id = $1', [id]);
  if (!c.rowCount) throw new HttpError(404, 'Case not found.');
  const m = await q(
    `SELECT m.*, EXISTS (SELECT 1 FROM hall_entries h WHERE h.message_id = m.id) AS in_hall
     FROM messages m WHERE m.case_id = $1 ORDER BY m.id`,
    [id]
  );
  res.json({ ...mapCase(c.rows[0]), messages: m.rows.map(mapMessage) });
}));

app.patch('/api/cases/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const s = caseSettings(req.body || {}, true);
  await assertJudgeExists(s.judge_id);
  const keys = Object.keys(s);
  if (!keys.length) throw new HttpError(400, 'Nothing to update.');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const { rows } = await q(`UPDATE cases SET ${sets} WHERE id = $1 RETURNING *`, [id, ...keys.map((k) => s[k])]);
  if (!rows.length) throw new HttpError(404, 'Case not found.');
  res.json(mapCase(rows[0]));
}));

app.delete('/api/cases/:id', wrap(async (req, res) => {
  const { rowCount } = await q('DELETE FROM cases WHERE id = $1', [toId(req.params.id)]);
  if (!rowCount) throw new HttpError(404, 'Case not found.');
  res.status(204).end();
}));

// ---- Judging ----
app.post('/api/cases/:id/messages', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw new HttpError(400, 'The court cannot judge an empty report. Please paste your defect report.');
  if (text.length > MAX_REPORT_LENGTH) throw new HttpError(400, `The report is too long (${text.length} characters). The maximum is ${MAX_REPORT_LENGTH}.`);
  const attachmentName = cleanText(body.attachmentName, 'Attachment name', 255) || null;

  const c = await q('SELECT * FROM cases WHERE id = $1', [id]);
  if (!c.rowCount) throw new HttpError(404, 'Case not found.');
  const theCase = c.rows[0];

  const j = theCase.judge_id ? await q('SELECT * FROM judges WHERE id = $1', [theCase.judge_id]) : { rows: [] };
  const judge = j.rows[0] || { name: 'The Court', intro: 'The court is in session.' };

  const result = judgeReport(text, { court: theCase.court, strictness: theCase.strictness, attachmentName });
  const tone = sarcasmTone(theCase.sarcasm);
  const lines = await q('SELECT verdict, tone, line FROM verdict_lines WHERE verdict = $1', [result.verdict.key]);
  const line = pickSentence(lines.rows, result.verdict.key, tone);
  const sentence = [judge.intro, line].filter(Boolean).join(' ');

  const details = {
    judgeName: judge.name,
    judgeIntro: judge.intro,
    tone,
    sentence,
    court: result.court,
    courtLabel: result.courtLabel,
    verdict: result.verdict,
    maxScore: result.maxScore,
    baseScore: result.baseScore,
    penalty: result.penalty,
    penaltyMultiplier: result.penaltyMultiplier,
    charges: result.charges,
    criteria: result.criteria,
    template: result.template,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userMsg = await client.query(
      'INSERT INTO messages (case_id, role, content, attachment_name) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, 'user', text, attachmentName]
    );
    const judgeMsg = await client.query(
      'INSERT INTO messages (case_id, role, content, score, verdict, details) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [id, 'judge', sentence, result.score, result.verdict.key, details]
    );
    // Title = first line of the first report.
    const title = text.split('\n')[0].trim().slice(0, 120) || 'Untitled case';
    await client.query(
      `UPDATE cases SET updated_at = now(),
         title = CASE WHEN (SELECT count(*) FROM messages WHERE case_id = $1) <= 2 THEN $2 ELSE title END
       WHERE id = $1`,
      [id, title]
    );
    await client.query('COMMIT');
    res.status(201).json({ messages: [mapMessage(userMsg.rows[0]), mapMessage(judgeMsg.rows[0])] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}));

// ---- Sample reports ----
app.get('/api/samples/random', wrap(async (req, res) => {
  const { rows } = await q('SELECT id, title, report FROM sample_reports ORDER BY random() LIMIT 1');
  if (!rows.length) throw new HttpError(404, 'No sample reports in the archive.');
  res.json(rows[0]);
}));

// ---- Hall of Fame / Shame ----
app.get('/api/hall', wrap(async (req, res) => {
  const cols = 'id, report, score, verdict, judge_name, court, created_at';
  const top = await q(`SELECT ${cols} FROM hall_entries ORDER BY score DESC, created_at DESC LIMIT 10`);
  const bottom = await q(`SELECT ${cols} FROM hall_entries ORDER BY score ASC, created_at DESC LIMIT 10`);
  const map = (r) => ({
    id: r.id, report: r.report, score: r.score, verdict: r.verdict,
    judgeName: r.judge_name, court: r.court, createdAt: r.created_at,
  });
  res.json({ top: top.rows.map(map), bottom: bottom.rows.map(map) });
}));

app.post('/api/hall', wrap(async (req, res) => {
  const messageId = toId((req.body || {}).messageId);
  const jm = await q("SELECT * FROM messages WHERE id = $1 AND role = 'judge'", [messageId]);
  if (!jm.rowCount) throw new HttpError(404, 'Verdict not found.');
  const judged = jm.rows[0];
  const um = await q(
    "SELECT content FROM messages WHERE case_id = $1 AND role = 'user' AND id < $2 ORDER BY id DESC LIMIT 1",
    [judged.case_id, judged.id]
  );
  if (!um.rowCount) throw new HttpError(404, 'Original report not found.');
  const d = judged.details || {};
  const { rows } = await q(
    `INSERT INTO hall_entries (message_id, report, score, verdict, judge_name, court)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (message_id) DO NOTHING RETURNING id`,
    [judged.id, um.rows[0].content, judged.score, judged.verdict, d.judgeName || null, d.court || null]
  );
  if (!rows.length) throw new HttpError(409, 'This verdict is already in the Hall.');
  res.status(201).json({ id: rows[0].id });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Error handler: known errors keep their message, database errors become a friendly 503.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  console.error(err);
  const dbError = err.code && (/^(08|57P|53)/.test(err.code) || ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(err.code));
  if (dbError || /timeout|connect/i.test(err.message)) return res.status(503).json({ error: DB_DOWN_MESSAGE });
  res.status(500).json({ error: 'Something went wrong in the courtroom. Please try again.' });
});

async function initDatabase(attempt = 1) {
  if (!pool) {
    console.error('DATABASE_URL is not set. The UI will show a database error.');
    return;
  }
  try {
    await migrateAndSeed();
    dbReady = true;
    console.log('Database ready.');
  } catch (err) {
    const delay = Math.min(30000, 2000 * attempt);
    console.error(`Database init failed (attempt ${attempt}): ${err.message}. Retrying in ${delay / 1000}s.`);
    setTimeout(() => initDatabase(attempt + 1), delay);
  }
}

app.listen(PORT, () => {
  console.log(`Bug Report Court listening on port ${PORT}`);
  initDatabase();
});
