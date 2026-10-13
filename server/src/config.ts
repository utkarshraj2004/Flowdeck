import path from 'node:path';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

export interface Config {
  baseUrl: string;
  host: string;
  port: number;
  databaseUrl: string;
  dataDir: string;
  uploadDir: string;
  maxUploadBytes: number;
  cookieSecure: boolean;
  trustProxy: boolean;
  webDir: string;
  sessionDays: number;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const port = int('PORT', 8080);
  const baseUrl = (process.env.FLOWDECK_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
  const dataDir = path.resolve(process.env.FLOWDECK_DATA_DIR || './data');
  const cookieEnv = process.env.FLOWDECK_COOKIE_SECURE;
  const cfg: Config = {
    baseUrl,
    host: process.env.HOST || '0.0.0.0',
    port,
    databaseUrl: process.env.DATABASE_URL || 'postgres://flowdeck:flowdeck@localhost:5432/flowdeck',
    dataDir,
    uploadDir: path.join(dataDir, 'uploads'),
    maxUploadBytes: int('MAX_UPLOAD_MB', 25) * 1024 * 1024,
    cookieSecure: cookieEnv ? cookieEnv === 'true' : baseUrl.startsWith('https://'),
    trustProxy: process.env.FLOWDECK_TRUST_PROXY === 'true',
    webDir: path.resolve(process.env.FLOWDECK_WEB_DIR || './dist/web'),
    sessionDays: int('SESSION_DAYS', 30),
    ...overrides,
  };
  if (overrides.dataDir && !overrides.uploadDir) cfg.uploadDir = path.join(overrides.dataDir, 'uploads');
  return cfg;
}
