// Waits until PostgreSQL accepts connections (used by the Codespace scripts).
import pg from 'pg';
const url = process.env.DATABASE_URL;
for (let i = 1; i <= 60; i++) {
  const c = new pg.Client({ connectionString: url });
  try {
    await c.connect();
    await c.end();
    process.exit(0);
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
console.error('PostgreSQL did not become ready in 60 s');
process.exit(1);
