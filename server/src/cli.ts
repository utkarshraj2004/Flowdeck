import { loadConfig } from './config.js';
import { createPool, one, withTx } from './db.js';
import { migrate, LATEST_SCHEMA } from './migrate.js';
import { createUserToken } from './lib/tokens.js';
import { randomToken } from './lib/security.js';

const usage = `Flowdeck command line

  migrate                                   apply pending database migrations
  status                                    show schema version and counts
  admin create --email <email>              create a system administrator and print a one-time setup link (24 h)
  admin reset-link --email <email>          print a one-time password-reset link (1 h) for an existing user
`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const [cmd, sub] = process.argv.slice(2);
const config = loadConfig();
const db = createPool(config.databaseUrl);

try {
  if (cmd === 'migrate') {
    const applied = await migrate(db, (m) => console.log(m));
    console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.');
  } else if (cmd === 'status') {
    const r = await one(db, `SELECT (SELECT max(version) FROM schema_migrations) AS schema, (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM boards)::int AS boards`);
    console.log(`schema ${r.schema} (build expects ${LATEST_SCHEMA()}), users ${r.users}, boards ${r.boards}`);
  } else if (cmd === 'admin' && sub === 'create') {
    await migrate(db);
    const email = arg('email');
    if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('Pass --email you@example.com');
    const token = await withTx(db, async (tx) => {
      const existing = await one(tx, 'SELECT id, password_hash FROM users WHERE lower(email) = lower($1)', [email]);
      if (existing?.password_hash) throw new Error('A user with this email already exists. Use "admin reset-link" instead.');
      const id =
        existing?.id ??
        (
          await one(
            tx,
            `INSERT INTO users (email, username, full_name, initials, is_system_admin) VALUES ($1,$2,$3,'?',true) RETURNING id`,
            [email, `pending_${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 32), email.split('@')[0].slice(0, 100) || 'Admin'],
          )
        ).id;
      await tx.query('UPDATE users SET is_system_admin = true WHERE id = $1', [id]);
      return createUserToken(tx, id, 'setup');
    });
    console.log(`\nOne-time setup link (valid 24 hours):\n\n  ${config.baseUrl}/setup/${token}\n\nOpen it in a browser to choose your name, username and password.`);
  } else if (cmd === 'admin' && sub === 'reset-link') {
    const email = arg('email');
    const user = await one(db, 'SELECT id, password_hash FROM users WHERE lower(email) = lower($1)', [email ?? '']);
    if (!user) throw new Error('No user with that email.');
    const token = await createUserToken(db, user.id, user.password_hash ? 'reset' : 'setup');
    console.log(`\nOne-time link (valid ${user.password_hash ? '1 hour' : '24 hours'}):\n\n  ${config.baseUrl}/setup/${token}\n`);
  } else {
    console.log(usage);
    process.exitCode = cmd ? 1 : 0;
  }
} catch (err) {
  console.error(`Error: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
