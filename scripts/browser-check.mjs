// Serves site/ and checks pages, navigation, styling, script and mobile layout in Chromium.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { existsSync } from 'node:fs';

const root = join(process.cwd(), 'site');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const fails = [];
const expect = (c, m) => { if (!c) fails.push(m); };

try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 375, height: 667 }]]) {
    const page = await browser.newPage({ viewport });
    const problems = [];
    page.on('pageerror', (e) => problems.push(String(e)));
    page.on('requestfailed', (r) => problems.push('request failed: ' + r.url()));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });

    await page.goto(base + '/index.html');
    expect((await page.title()).length > 0, `${name}: page has a title`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.site-header')).backgroundColor !== 'rgba(0, 0, 0, 0)'), `${name}: stylesheet applied`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: no horizontal scroll`);

    if (name === 'mobile') {
      expect(await page.isVisible('.nav-toggle'), 'mobile: menu button visible');
      expect(!(await page.isVisible('#site-nav')), 'mobile: nav hidden initially');
      await page.click('.nav-toggle');
      expect(await page.isVisible('#site-nav'), 'mobile: script opens nav');
    }
    await page.click('#site-nav a[href="about.html"]');
    await page.waitForURL('**/about.html');
    expect((await page.textContent('h1')) === 'About', `${name}: navigation to about works`);
    expect(problems.length === 0, `${name}: console/network problems: ${problems.join('; ')}`);
    await page.close();
  }
} finally { await browser.close(); server.close(); }

if (fails.length) { console.error(fails.map((f) => 'FAIL: ' + f).join('\n')); process.exit(1); }
console.log('OK: browser checks passed (desktop + mobile)');
