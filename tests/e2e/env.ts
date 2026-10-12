export const ADMIN_URL = process.env.TEST_DATABASE_URL || 'postgres://flowdeck:flowdeck@localhost:5432/postgres';
export const E2E_DB = 'flowdeck_e2e';
const u = new URL(ADMIN_URL);
u.pathname = `/${E2E_DB}`;
export const E2E_DB_URL = u.toString();
