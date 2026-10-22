const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

// Railway's internal network does not use SSL; public proxy URLs do.
function sslFor(url) {
  if (!url) return false;
  if (/sslmode=disable/.test(url)) return false;
  if (/localhost|127\.0\.0\.1|\.railway\.internal/.test(url)) return false;
  return { rejectUnauthorized: false };
}

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: sslFor(connectionString),
      max: 5,
      connectionTimeoutMillis: 5000,
    })
  : null;

if (pool) {
  // An idle client error must not crash the process.
  pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));
}

module.exports = { pool };
