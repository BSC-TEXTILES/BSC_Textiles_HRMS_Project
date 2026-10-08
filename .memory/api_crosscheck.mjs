// Audit script: cross-check frontend API calls against backend route definitions.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'd:/BSC Textiles HRMS';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', 'dist', '.git', 'backups'].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// --- Report pages with no API usage at all ---
const pageFiles = walk(path.join(ROOT, 'frontend/src/app')).filter((f) => /page\.tsx$/.test(f));
console.log('=== PAGES WITH NO api.* CALL ===');
for (const f of pageFiles) {
  const src = fs.readFileSync(f, 'utf8');
  if (!/api\.(get|post|put|patch|delete)/.test(src)) {
    const hasFetch = /fetch\(/.test(src);
    console.log(`  ${path.relative(ROOT, f)}${hasFetch ? ' (uses fetch)' : ' (NO NETWORK CALL)'}`);
  }
}
console.log('');

// --- Collect frontend API calls ---
const feFiles = walk(path.join(ROOT, 'frontend/src'));
const feCalls = new Map(); // path -> [file:line]
for (const f of feFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const re = /api\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)[`'"]/g;
    let m;
    while ((m = re.exec(line))) {
      const p = m[2].split('?')[0];
      const key = `${m[1].toUpperCase()} ${p}`;
      if (!feCalls.has(key)) feCalls.set(key, []);
      feCalls.get(key).push(`${path.relative(ROOT, f)}:${i + 1}`);
    }
    // fetch( calls to API_URL
    const re2 = /fetch\(\s*[`'"]\$\{API_URL\}([^`'"]*)[`'"]/g;
    while ((m = re2.exec(line))) {
      const p = m[1].split('?')[0] || '/';
      const key = `FETCH ${p.startsWith('/auth') ? p : p}`;
      if (!feCalls.has(key)) feCalls.set(key, []);
      feCalls.get(key).push(`${path.relative(ROOT, f)}:${i + 1}`);
    }
  });
}

// --- Collect backend routes ---
const beFiles = walk(path.join(ROOT, 'backend/src/routes'));
const routes = new Map(); // "METHOD /path" -> file
const routerPrefix = {
  // index.ts mount map
};
for (const f of beFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) {
    routes.set(`${m[1].toUpperCase()} ${m[2]}`, path.basename(f));
  }
}

// mount prefixes from index.ts
const indexSrc = fs.readFileSync(path.join(ROOT, 'backend/src/index.ts'), 'utf8');
const mounts = [...indexSrc.matchAll(/app\.use\('([^']+)',\s*\w+Routes\)/g)].map((m) => m[1]);

function normalizeBackendPath(mount, p) {
  if (p === '/') return mount;
  return (mount + p).replace(/\/$/, '') || mount;
}

const normalized = new Map();
for (const [key, file] of routes) {
  const [method, p] = key.split(' ');
  for (const mount of mounts) {
    const full = normalizeBackendPath(mount, p);
    normalized.set(`${method} ${full}`, file);
    // also record param wildcard
    const wild = full.replace(/:[^/]+/g, '*');
    normalized.set(`${method} ${wild}`, file);
  }
}

// --- Compare ---
const missing = [];
for (const [key, files] of feCalls) {
  const [method, p] = key.split(' ');
  if (method === 'FETCH') {
    continue; // next-auth internal
  }
  const wildFe = p.replace(/\$\{[^}]+\}/g, '*');
  const candidates = [
    `${method} ${p}`,
    `${method} ${p.replace(/\/$/, '')}`,
    `${method} ${wildFe}`,
    `${method} ${wildFe.replace(/\/$/, '')}`,
    `${method} /api${p}`,
    `${method} /api${wildFe}`,
  ];
  const found = candidates.some((c) => normalized.has(c));
  if (!found) missing.push(`${key}  <- ${files.join(', ')}`);
}

console.log('=== MOUNTS ===');
console.log(mounts.join(', '));
console.log('\n=== FRONTEND CALLS NOT MATCHING ANY BACKEND ROUTE ===');
if (missing.length === 0) console.log('(none)');
else missing.forEach((x) => console.log('  ' + x));
console.log(`\nTotal frontend calls: ${feCalls.size}, Backend routes: ${routes.size}`);
