import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';

const config = loadConfig();
const db = createPool(config.databaseUrl);

async function waitForDb(retries = 30) {
  for (let i = 1; i <= retries; i++) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (err) {
      if (i === retries) throw err;
      console.log(`waiting for database (${i}/${retries}): ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

await waitForDb();
await migrate(db, (m) => console.log(m));
const app = await buildApp(config, { db, logger: true });
await app.listen({ host: config.host, port: config.port });
app.log.info(`Flowdeck listening on ${config.host}:${config.port} (public URL ${config.baseUrl})`);
const users = await db.query('SELECT count(*)::int AS n FROM users');
if (users.rows[0].n === 0)
  app.log.warn(
    `No users yet. Create the first administrator with:  ${process.env.FLOWDECK_ADMIN_HINT || 'docker compose exec app node dist/server/cli.js admin create --email you@example.com'}`,
  );

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    app.log.info(`${sig} received, shutting down`);
    await app.close();
    await db.end();
    process.exit(0);
  });
