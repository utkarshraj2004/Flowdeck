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
  /** Optional SMTP server (smtp:// or smtps:// URL). Without it, every email feature is off and in-app flows still work. */
  smtpUrl: string | null;
  mailFrom: string;
  /** Minutes an unread notification waits before it goes into an email digest (users opt in). */
  emailDigestMinutes: number;
  /** Allow webhooks to private, loopback and link-local addresses (off by default: protects internal services). */
  webhookAllowPrivate: boolean;
  /** Background worker interval (webhook and email delivery, due-soon automation). 0 disables the timer. */
  workerIntervalMs: number;
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
    smtpUrl: process.env.FLOWDECK_SMTP_URL || null,
    mailFrom: process.env.FLOWDECK_MAIL_FROM || `Flowdeck <flowdeck@${new URL(baseUrl).hostname}>`,
    emailDigestMinutes: int('FLOWDECK_EMAIL_DIGEST_MINUTES', 15),
    webhookAllowPrivate: process.env.FLOWDECK_WEBHOOK_ALLOW_PRIVATE === 'true',
    workerIntervalMs: process.env.FLOWDECK_WORKER_INTERVAL_MS === '0' ? 0 : int('FLOWDECK_WORKER_INTERVAL_MS', 5000),
    ...overrides,
  };
  if (overrides.dataDir && !overrides.uploadDir) cfg.uploadDir = path.join(overrides.dataDir, 'uploads');
  return cfg;
}
