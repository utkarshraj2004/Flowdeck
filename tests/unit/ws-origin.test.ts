import { describe, expect, it } from 'vitest';
import { originAllowed } from '../../server/src/routes/ws.js';

const cfg = (baseUrl: string, trustProxy = false) => ({ config: { baseUrl, trustProxy } as any });

describe('WebSocket origin check', () => {
  it('allows the host the page was served from and the configured public URL', () => {
    expect(originAllowed('http://192.168.1.20:8080', { host: '192.168.1.20:8080' }, cfg('http://localhost:8080'))).toBe(true);
    expect(originAllowed('https://flow.example.com', { host: 'app:8080' }, cfg('https://flow.example.com'))).toBe(true);
  });
  it('refuses foreign or malformed origins', () => {
    expect(originAllowed('https://evil.example', { host: 'localhost:8080' }, cfg('http://localhost:8080'))).toBe(false);
    expect(originAllowed('not a url', { host: 'localhost:8080' }, cfg('http://localhost:8080'))).toBe(false);
  });
  it('honours X-Forwarded-Host only when the proxy is trusted (e.g. the Codespaces forwarder)', () => {
    const h = { host: 'localhost:8080', 'x-forwarded-host': 'name-8080.app.github.dev' };
    expect(originAllowed('https://name-8080.app.github.dev', h, cfg('http://localhost:8080', true))).toBe(true);
    expect(originAllowed('https://name-8080.app.github.dev', h, cfg('http://localhost:8080', false))).toBe(false);
    expect(originAllowed('https://evil.example', { ...h, 'x-forwarded-host': 'name-8080.app.github.dev' }, cfg('http://localhost:8080', true))).toBe(false);
  });
});
