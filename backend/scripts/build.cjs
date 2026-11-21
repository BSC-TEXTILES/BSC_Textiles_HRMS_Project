#!/usr/bin/env node
const { execSync } = require('node:child_process');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../..');
const backendDir = path.resolve(__dirname, '..');

// Ensure express-rate-limit prototype pollution patch is applied
try {
  require(path.join(rootDir, 'scripts', 'patch-express-rate-limit.cjs'));
} catch (e) {
  console.warn('[build] Note: patch-express-rate-limit skipped:', e.message);
}

try {
  require.resolve('typescript/bin/tsc');
} catch {
  console.log('[build] TypeScript compiler not found in dependencies; installing typescript...');
  execSync('npm install --no-save typescript', { stdio: 'inherit', cwd: rootDir });
}

const tscBin = require.resolve('typescript/bin/tsc');
const extraArgs = process.argv.slice(2);
process.argv = [process.argv[0], tscBin, '-p', backendDir, ...extraArgs];
require(tscBin);
