// Deterministic research fixture, never a model or a shipping provider.
import fs from 'node:fs';
const prompt = process.argv.at(-1);
const spec = JSON.parse(fs.readFileSync('scenario.json', 'utf8'));
fs.writeFileSync('received-prompt.txt', prompt);
if (spec.kind === 'failure' && !fs.existsSync('recovered')) {
  console.error('Fixture interruption: local dependency unavailable'); process.exit(2);
}
if (spec.kind === 'decision' && !prompt.includes('DECISION: cap at 10')) {
  console.log('## Result\nTwo compatible limits exist; policy owner must choose.\n\n## Evidence\nfixture policy has no maximum\n\n## Verification\nNo implementation yet.\n\n## Needs human decision\nREQUIRED: yes\nQUESTION: Should the public limit cap at 10 or 100?');
  process.exit(0);
}
const corrected = prompt.includes('CORRECTION: handle negative values');
const code = spec.kind === 'partial' && !corrected
  ? 'export const clamp = n => Math.min(10, n);\n'
  : 'export const clamp = n => Math.max(0, Math.min(10, n));\n';
if (spec.kind !== 'investigation') fs.writeFileSync('clamp.mjs', code);
if (spec.kind === 'multi') fs.writeFileSync('USAGE.md', 'clamp bounds a number to [0, 10].\n');
console.log(`## Result\n${spec.kind === 'investigation' ? 'The boundary condition is a negative input; no change made.' : 'Implemented the requested clamp.'}\n\n## Evidence\n${spec.kind === 'investigation' ? 'fixture clamp.mjs' : 'clamp.mjs'}\n\n## Changes\n${spec.kind === 'investigation' ? 'None' : 'clamp.mjs'}\n\n## Verification\n${spec.kind === 'partial' && !corrected ? 'Upper-bound example only; negative inputs not checked.' : 'Fixture statement only; no tests executed by provider.'}\n\n## Needs human decision\nREQUIRED: no`);
