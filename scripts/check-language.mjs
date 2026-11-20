#!/usr/bin/env node
// P0-3 language gate: zero occurrences of the retired mode's name in any live
// path of the action repo (source, manifest, README). The only allowed
// mention in the product lives in the lab repo contract legacy appendix.
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const targets = ['src', 'action.yml', 'README.md'];
const offenders = [];

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      scan(p);
    } else if (/\.(ts|js|mjs|yml|yaml|md|json)$/.test(entry.name)) {
      const content = fs.readFileSync(p, 'utf8');
      if (/simulat/i.test(content)) offenders.push(p);
    }
  }
}

for (const t of targets) {
  const p = path.join(root, t);
  if (fs.existsSync(p)) (fs.statSync(p).isDirectory() ? scan(p) : offendersCheck(p));
}

function offendersCheck(p) {
  if (/simulat/i.test(fs.readFileSync(p, 'utf8'))) offenders.push(p);
}

if (offenders.length) {
  console.error('language gate failed; the retired mode must not appear in live paths:');
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}
console.log('language gate ok: live paths are clean');
