/**
 * Automated Security Patch for engine.io
 * Neutralizes DoS Vulnerability (GHSA-v775-f652-7rv6: unhandled upgrade error)
 *
 * References:
 * - engine.io commit f8e8746492f4118c7ef6a40e51f9c26fdc3ecc31
 * - Attaches socket.on("error") immediately when an unhandled upgrade request arrives,
 *   preventing abrupt socket resets (ECONNRESET) from triggering an uncaught exception.
 */

const fs = require('fs');
const path = require('path');

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if already patched
  if (content.includes('// [patched-ghsa-v775-f652-7rv6]')) {
    console.log(`[security-patch-engine-io] Already patched: ${filePath}`);
    return false;
  }

  const target = `                else if (false !== options.destroyUpgrade) {
                    // default node behavior is to disconnect when no handlers
                    // but by adding a handler, we prevent that
                    // and if no eio thing handles the upgrade
                    // then the socket needs to die!
                    setTimeout(function () {
                        // @ts-ignore
                        if (socket.writable && socket.bytesWritten <= 0) {
                            socket.on("error", (e) => {
                                debug("error while destroying upgrade: %s", e.message);
                            });
                            return socket.end();
                        }
                    }, destroyUpgradeTimeout);
                }`;

  const replacement = `                else if (false !== options.destroyUpgrade) {
                    // [patched-ghsa-v775-f652-7rv6] Attach error listener immediately to prevent ECONNRESET crash
                    socket.on("error", (e) => {
                        debug("error while destroying upgrade: %s", e.message);
                    });
                    setTimeout(function () {
                        // @ts-ignore
                        if (socket.writable && socket.bytesWritten <= 0) {
                            return socket.end();
                        }
                    }, destroyUpgradeTimeout);
                }`;

  if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[security-patch-engine-io] Successfully patched: ${filePath}`);
    return true;
  }

  // Fallback pattern matching if indentation or comments differ
  const regex = /else\s+if\s*\(\s*false\s*!==\s*options\.destroyUpgrade\s*\)\s*\{([\s\S]*?)setTimeout\s*\(\s*function\s*\(\s*\)\s*\{/m;
  if (regex.test(content) && !content.includes('[patched-ghsa-v775-f652-7rv6]')) {
    content = content.replace(regex, (match) => {
      return `else if (false !== options.destroyUpgrade) {\n                    // [patched-ghsa-v775-f652-7rv6]\n                    socket.on("error", (e) => { debug("error while destroying upgrade: %s", e.message); });\n                    setTimeout(function () {`;
    });
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[security-patch-engine-io] Successfully patched via regex: ${filePath}`);
    return true;
  }

  console.log(`[security-patch-engine-io] Pattern not found (may already be patched or upgraded): ${filePath}`);
  return false;
}

function runPatch() {
  const possiblePaths = [
    path.join(__dirname, '..', 'node_modules', 'engine.io', 'build', 'server.js'),
    path.join(__dirname, '..', 'backend', 'node_modules', 'engine.io', 'build', 'server.js'),
  ];

  try {
    const resolved = require.resolve('engine.io');
    possiblePaths.unshift(path.join(path.dirname(resolved), 'server.js'));
  } catch {}

  const visited = new Set();
  for (const p of possiblePaths) {
    if (visited.has(p) || !fs.existsSync(p)) continue;
    visited.add(p);
    patchFile(p);
  }
}

runPatch();
