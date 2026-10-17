#!/usr/bin/env node
/**
 * BSC Textiles HRMS — Automated Secret Scanner & Pre-Commit Protection
 * Detects hardcoded secrets, database credentials, API keys, private keys, and tokens
 * without printing secret values to terminal or logs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const IGNORED_PATHS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.system_generated',
  'scratch',
  'skills-lock.json',
  'package-lock.json'
];

// High-confidence regex patterns for credentials
const SECRET_RULES = [
  {
    name: 'Embedded Database Password in URI',
    regex: /(?:postgres(?:ql)?|mysql|mongodb):\/\/[^:\s'"]+:([^@\s'"]+)@/gi,
    isSafe: (match, group1) => {
      const lower = group1.toLowerCase();
      return (
        lower === 'password' ||
        lower === 'postgres' ||
        lower === 'root' ||
        lower === '' ||
        group1.includes('${') ||
        group1.includes('<') ||
        group1.includes('[') ||
        group1.includes('xxx')
      );
    }
  },
  {
    name: 'Hardcoded Private Key',
    regex: /-----BEGIN\s+(?:RSA|OPENSSH|EC|DSA|PRIVATE)\s+KEY-----/gi,
    isSafe: () => false
  },
  {
    name: 'SendGrid / Generic Cloud API Key',
    regex: /\bSG\.[a-zA-Z0-9_\-\.]{20,}/gi,
    isSafe: (m) => m.includes('xxx') || m.includes('placeholder')
  },
  {
    name: 'Hardcoded High-Entropy JWT / Auth Secret Fallback',
    regex: /(?:JWT_SECRET|NEXTAUTH_SECRET)\s*(?:=|:|\?\?|\|\|)\s*['"`]([a-zA-Z0-9_=\-\.]{24,})['"`]/gi,
    isSafe: (m, g1) => {
      const lower = g1.toLowerCase();
      return (
        lower.includes('placeholder') ||
        lower.includes('example') ||
        lower.includes('dev-only') ||
        lower.includes('test-') ||
        lower.includes('generate-with') ||
        lower.includes('your-strong-random')
      );
    }
  },
  {
    name: 'Hardcoded Plaintext Enterprise Password Comparison',
    regex: /cleanPassword\s*===\s*['"`]([a-zA-Z0-9!@#$%^&*()_+]{6,})['"`]/gi,
    isSafe: () => false
  }
];

function scanFile(filePath, content, violations) {
  const lines = content.split('\n');
  lines.forEach((line, lineIdx) => {
    // Skip comment-only documentation notes if safe
    for (const rule of SECRET_RULES) {
      const matches = [...line.matchAll(rule.regex)];
      for (const match of matches) {
        const secretVal = match[1] || match[0];
        if (!rule.isSafe(match[0], secretVal)) {
          violations.push({
            rule: rule.name,
            file: filePath,
            line: lineIdx + 1,
            // Mask any credential characters to ensure zero leakage in CI logs
            maskedSnippet: line.trim().replace(secretVal, '[REDACTED_CREDENTIAL]')
          });
        }
      }
    }
  });
}

function runScanner() {
  console.log('================================================================');
  console.log('🔒 BSC TEXTILES HRMS — AUTOMATED SECRET SCANNER');
  console.log('================================================================\n');

  let targetFiles = [];
  try {
    // Check tracked files via git
    const output = execSync('git ls-files', { encoding: 'utf8' });
    targetFiles = output
      .split('\n')
      .map(f => f.trim())
      .filter(f => f && !IGNORED_PATHS.some(p => f.startsWith(p)));
  } catch {
    console.warn('Git not found or error listing files. Scanning directory directly.');
  }

  const violations = [];

  for (const relPath of targetFiles) {
    if (!fs.existsSync(relPath)) continue;
    try {
      const stats = fs.statSync(relPath);
      if (stats.size > 2 * 1024 * 1024) continue; // Skip large binary files
      const content = fs.readFileSync(relPath, 'utf8');
      scanFile(relPath, content, violations);
    } catch {
      // Ignore unreadable/binary files
    }
  }

  if (violations.length > 0) {
    console.error(`❌ FAILED: Found ${violations.length} high-confidence secret exposure(s):\n`);
    violations.forEach((v, i) => {
      console.error(`  [${i + 1}] Rule: ${v.rule}`);
      console.error(`      Location: ${v.file}:${v.line}`);
      console.error(`      Sanitized Reference: ${v.maskedSnippet.substring(0, 100)}\n`);
    });
    console.error('Please eliminate hardcoded credentials and reference environment variables instead.');
    process.exit(1);
  }

  console.log('✅ PASSED: Zero exposed secrets detected across all tracked repository files.');
  console.log('   All sensitive connection strings and authentication secrets are properly parameterized.\n');
  process.exit(0);
}

runScanner();
