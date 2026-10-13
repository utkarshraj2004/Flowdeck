#!/usr/bin/env node
// Regenerates docs/DEPENDENCIES.md from package.json and installed packages. Run after `npm ci`.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const info = (d) => require(`../node_modules/${d}/package.json`);
const purpose = {
  fastify: 'HTTP server', '@fastify/compress': 'Response compression', '@fastify/cookie': 'Session cookies', '@fastify/multipart': 'Streaming file uploads',
  '@fastify/rate-limit': 'Login rate limiting', '@fastify/static': 'Serving the web client', '@fastify/websocket': 'Real-time WebSocket',
  '@node-rs/argon2': 'Password hashing (argon2id)', 'fractional-indexing': 'Card and list ordering keys', pg: 'PostgreSQL client', nodemailer: 'Optional SMTP email',
};
const bundled = ['react', 'react-dom', 'react-router-dom', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', 'markdown-it', 'lucide-react'];

// Licenses across the whole installed tree.
const counts = {};
const walk = (dir) => {
  for (const n of fs.readdirSync(dir)) {
    if (n.startsWith('.')) continue;
    const pth = `${dir}/${n}`;
    if (n.startsWith('@')) { walk(pth); continue; }
    if (!fs.existsSync(`${pth}/package.json`)) continue;
    const j = JSON.parse(fs.readFileSync(`${pth}/package.json`, 'utf8'));
    const l = typeof j.license === 'string' ? j.license : 'UNKNOWN';
    counts[l] = (counts[l] || 0) + 1;
    if (fs.existsSync(`${pth}/node_modules`)) walk(`${pth}/node_modules`);
  }
};
walk('node_modules');

let out = `# Third-party dependencies\n\nFlowdeck’s own code has **no license chosen yet** (see README). The packages below keep their own licenses. Versions are pinned in \`package.json\` / \`package-lock.json\`. Regenerate with \`node scripts/dependency-notices.mjs\`.\n\n`;
out += `## Runtime (installed in the production image)\n\n| Package | Version | License | Purpose |\n|---|---|---|---|\n`;
for (const d of Object.keys(p.dependencies)) out += `| ${d} | ${info(d).version} | ${info(d).license} | ${purpose[d] ?? ''} |\n`;
out += `\n## Bundled into the web client (build time)\n\n| Package | Version | License |\n|---|---|---|\n`;
for (const d of bundled) out += `| ${d} | ${info(d).version} | ${info(d).license} |\n`;
out += `\n## Development and test only (not shipped)\n\n| Package | Version | License |\n|---|---|---|\n`;
for (const d of Object.keys(p.devDependencies).filter((d) => !bundled.includes(d))) out += `| ${d} | ${info(d).version} | ${info(d).license} |\n`;
out += `\n## Container images\n\n| Image | Use | License |\n|---|---|---|\n| \`node:22-bookworm-slim\` | Build and runtime base | Node.js: MIT; Debian packages: various free licenses |\n| \`postgres:16-alpine\` | Database | PostgreSQL License |\n| \`caddy:2\` (optional) | HTTPS proxy | Apache-2.0 |\n`;
out += `\n## All installed packages by license\n\n${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `- ${l}: ${n}`).join('\n')}\n\n`;
out += `MPL-2.0 applies to \`axe-core\` (test-only accessibility scanner, not shipped). Icons are Unicode characters and an original SVG logo; no third-party icon or font files are bundled. Run \`npm audit\` after dependency changes.\n`;
fs.writeFileSync('docs/DEPENDENCIES.md', out);
console.log('docs/DEPENDENCIES.md written');
