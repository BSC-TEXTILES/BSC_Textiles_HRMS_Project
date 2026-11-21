/**
 * Automated Security Patch for express-rate-limit
 * Neutralizes Prototype Pollution Gadget (Object.prototype.max = 1e9)
 *
 * References:
 * - Guards `limit: passedOptions.max ?? 5` with `hasOwnProperty`
 * - Guards `legacyHeaders: passedOptions.headers ?? true` with `hasOwnProperty`
 * - Enforces `const omittedOptions = Object.create(null)` in omitUndefinedOptions
 */

const fs = require('fs');
const path = require('path');

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // 1. Patch omitUndefinedOptions to use null-prototype dictionary
  if (content.includes('const omittedOptions = {};')) {
    content = content.replace(
      'const omittedOptions = {};',
      'const omittedOptions = Object.create(null);'
    );
    modified = true;
  }

  // 2. Patch limit: passedOptions.max ?? 5
  if (content.includes('limit: passedOptions.max ?? 5,')) {
    content = content.replace(
      'limit: passedOptions.max ?? 5,',
      "limit: (Object.prototype.hasOwnProperty.call(passedOptions, 'max') ? passedOptions.max : undefined) ?? 5,"
    );
    modified = true;
  }

  // 3. Patch legacyHeaders: passedOptions.headers ?? true
  if (content.includes('legacyHeaders: passedOptions.headers ?? true,')) {
    content = content.replace(
      'legacyHeaders: passedOptions.headers ?? true,',
      "legacyHeaders: (Object.prototype.hasOwnProperty.call(passedOptions, 'headers') ? passedOptions.headers : undefined) ?? true,"
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[security-patch] Successfully patched: ${filePath}`);
    return true;
  } else {
    console.log(`[security-patch] Already patched / verified: ${filePath}`);
    return false;
  }
}

function runPatch() {
  const possibleDirs = [
    path.join(__dirname, '..', 'node_modules', 'express-rate-limit', 'dist'),
    path.join(__dirname, '..', 'backend', 'node_modules', 'express-rate-limit', 'dist'),
  ];

  try {
    const resolved = require.resolve('express-rate-limit');
    possibleDirs.unshift(path.dirname(resolved));
  } catch {}

  const visited = new Set();
  for (const dir of possibleDirs) {
    if (visited.has(dir) || !fs.existsSync(dir)) continue;
    visited.add(dir);
    patchFile(path.join(dir, 'index.cjs'));
    patchFile(path.join(dir, 'index.mjs'));
  }
}

runPatch();
