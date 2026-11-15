#!/usr/bin/env node
const { execSync } = require('node:child_process');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../..');
const backendDir = path.resolve(__dirname, '..');

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
