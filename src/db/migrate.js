// Schema migrations and idempotent seed. Runs on every server start (i.e. on every deploy).
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');
const { parseCsv } = require('./csv');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// Append-only list. Never edit an applied migration; add a new one instead.
const MIGRATIONS = [
  {
    id: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE judges (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        tone TEXT NOT NULL DEFAULT '',
        intro TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE cases (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Untitled case',
        court TEXT NOT NULL DEFAULT 'district' CHECK (court IN ('junior', 'district', 'supreme')),
        judge_id INTEGER REFERENCES judges(id) ON DELETE SET NULL,
        sarcasm NUMERIC(2,1) NOT NULL DEFAULT 0.5 CHECK (sarcasm BETWEEN 0 AND 1),
        strictness NUMERIC(2,1) NOT NULL DEFAULT 0.5 CHECK (strictness BETWEEN 0 AND 1),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE messages (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'judge')),
        content TEXT NOT NULL,
        attachment_name TEXT,
        score NUMERIC(3,1),
        verdict TEXT,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX messages_case_idx ON messages(case_id, id);

      CREATE TABLE verdict_lines (
        id SERIAL PRIMARY KEY,
        verdict TEXT NOT NULL,
        tone TEXT NOT NULL CHECK (tone IN ('polite', 'dry', 'savage')),
        line TEXT NOT NULL,
        UNIQUE (verdict, tone, line)
      );

      CREATE TABLE sample_reports (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        quality TEXT NOT NULL DEFAULT 'bad',
        report TEXT NOT NULL UNIQUE
      );

      -- Snapshot of a judged report; survives deletion of the original case.
      CREATE TABLE hall_entries (
        id SERIAL PRIMARY KEY,
        message_id INTEGER UNIQUE REFERENCES messages(id) ON DELETE SET NULL,
        report TEXT NOT NULL,
        score NUMERIC(3,1) NOT NULL,
        verdict TEXT NOT NULL,
        judge_name TEXT,
        court TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX hall_score_idx ON hall_entries(score);

      CREATE TABLE app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

const DEFAULT_JUDGES = [
  {
    name: 'Judge Thompson',
    tone: 'A reformed tester. Stern but fair.',
    intro: 'Judge Thompson adjusts their glasses and reviews the evidence.',
  },
  {
    name: 'The Product Owner',
    tone: 'Everything is a must-have. Impatient.',
    intro: 'The Product Owner checks the clock: this should have shipped yesterday.',
  },
  {
    name: 'The Developer On Call',
    tone: "Defensive. 'Works on my machine.'",
    intro: 'The Developer On Call sighs: it works on my machine, but fine, let us see.',
  },
];

const DEFAULT_VERDICT_LINES = [
  ['GUILTY', 'polite', 'Please add the missing details and try again.'],
  ['GUILTY', 'dry', 'The court has read this report twice. It did not improve.'],
  ['GUILTY', 'savage', 'The court has seen ransom notes with more structure.'],
  ['PROBATION', 'polite', 'A solid start. A few more details are needed.'],
  ['PROBATION', 'dry', 'Half a report is still half a report.'],
  ['PROBATION', 'savage', 'Technically a report. Practically a riddle.'],
  ['ACQUITTED', 'polite', 'Well done. This report is clear.'],
  ['ACQUITTED', 'dry', 'Case dismissed. Do not let it go to your head.'],
  ['ACQUITTED', 'savage', 'The court is almost disappointed it has nothing to roast.'],
  ['HALL_OF_FAME', 'polite', 'An exemplary report. Thank you.'],
  ['HALL_OF_FAME', 'dry', 'This report goes straight into the textbooks.'],
  ['HALL_OF_FAME', 'savage', 'So good the product owner might even read it.'],
];

function readCsv(file) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    console.warn(`Seed file ${file} not found, using built-in defaults.`);
    return null;
  }
  return parseCsv(fs.readFileSync(full, 'utf8'));
}

async function runMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  const { rows } = await client.query('SELECT id FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await client.query('BEGIN');
    try {
      await client.query(m.sql);
      await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [m.id, m.name]);
      await client.query('COMMIT');
      console.log(`Applied migration ${m.id}: ${m.name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
}

async function seed(client) {
  // Judges are seeded once, so judges deleted or edited by users stay that way after redeploys.
  const seeded = await client.query("SELECT 1 FROM app_meta WHERE key = 'judges_seeded'");
  if (!seeded.rowCount) {
    for (const j of DEFAULT_JUDGES) {
      await client.query(
        'INSERT INTO judges (name, tone, intro) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM judges WHERE name = $1)',
        [j.name, j.tone, j.intro]
      );
    }
    await client.query("INSERT INTO app_meta (key, value) VALUES ('judges_seeded', 'true') ON CONFLICT DO NOTHING");
  }

  const lines = readCsv('verdict_lines.csv');
  const lineRows = lines ? lines.map((l) => [l.verdict, l.tone, l.line]) : DEFAULT_VERDICT_LINES;
  for (const [verdict, tone, line] of lineRows) {
    if (!verdict || !tone || !line) continue;
    await client.query(
      'INSERT INTO verdict_lines (verdict, tone, line) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [verdict.toUpperCase(), tone.toLowerCase(), line]
    );
  }

  const samples = readCsv('sample_defect_reports.csv') || [];
  for (const s of samples) {
    if (!s.report) continue;
    await client.query(
      'INSERT INTO sample_reports (title, language, quality, report) VALUES ($1, $2, $3, $4) ON CONFLICT (report) DO NOTHING',
      [s.title || s.report.split('\n')[0], s.language || 'en', s.quality || 'bad', s.report]
    );
  }
}

async function migrateAndSeed() {
  if (!pool) throw new Error('DATABASE_URL is not set');
  const client = await pool.connect();
  try {
    // Prevent two instances from migrating at the same time.
    await client.query('SELECT pg_advisory_lock(424242)');
    try {
      await runMigrations(client);
      await seed(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock(424242)');
    }
  } finally {
    client.release();
  }
}

module.exports = { migrateAndSeed };

if (require.main === module) {
  migrateAndSeed()
    .then(() => {
      console.log('Migrations and seed complete.');
      return pool.end();
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
