// Static checks for the site/ folder. No dependencies.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const SITE = resolve('site');
const REQUIRED = ['index.html', 'styles.css', 'script.js'];
const errors = [];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(SITE)) { console.error('site/ folder missing'); process.exit(1); }
for (const f of REQUIRED) if (!existsSync(join(SITE, f))) errors.push(`missing required file site/${f}`);

const files = walk(SITE);

for (const f of files.filter((f) => ['.js', '.mjs'].includes(extname(f)))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { errors.push(`JS syntax error in ${f}: ${e.stderr}`); }
}

const refRe = /(?:href|src)\s*=\s*"([^"]*)"/gi;
const cssRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
function check(from, ref) {
  if (!ref || /^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(ref)) return;
  if (ref.startsWith('/')) { errors.push(`${from}: root-absolute reference "${ref}" breaks on GitHub Pages project sites; use a relative path`); return; }
  const target = resolve(dirname(from), ref.split('#')[0].split('?')[0]);
  if (!existsSync(target)) errors.push(`${from}: broken reference "${ref}"`);
}
for (const f of files) {
  const ext = extname(f);
  if (ext === '.html') for (const m of readFileSync(f, 'utf8').matchAll(refRe)) check(f, m[1]);
  if (ext === '.css') for (const m of readFileSync(f, 'utf8').matchAll(cssRe)) check(f, m[1]);
}

if (errors.length) { console.error(errors.map((e) => 'FAIL: ' + e).join('\n')); process.exit(1); }
console.log(`OK: ${files.length} files checked in site/`);
