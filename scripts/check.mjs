import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateBank } from '../public/planner.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const bytes = await readFile(new URL('../public/data/bank.json', import.meta.url));
const dataset = JSON.parse(bytes);
const provenance = JSON.parse(await readFile(new URL('../public/data/provenance.json', import.meta.url), 'utf8'));
assert.equal(dataset.schemaVersion, 1, 'Unsupported dataset schema');
assert.equal(dataset.datasetVersion, provenance.datasetVersion, 'Dataset version mismatch');
assert.equal(new Set(dataset.banks.map((bank) => bank.id)).size, dataset.banks.length, 'Duplicate bank IDs');
for (const bank of dataset.banks) {
  validateBank(bank);
  assert.ok(bank.hosts.length && bank.phages.length, 'Bank must contain hosts and phages');
  for (const host of bank.hosts) assert.ok(host.pairs.some((pair) => Number.isFinite(pair.score)), `No scored pairs for ${host.id}`);
}
const snapshot = provenance.generatedFiles.find((file) => file.path === 'public/data/bank.json');
assert.equal(createHash('sha256').update(bytes).digest('hex'), snapshot.sha256, 'Compact data integrity mismatch');
for (const file of ['public/app.js', 'public/planner.js', 'public/export.js', 'scripts/serve.mjs', 'scripts/build.mjs']) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
console.log(`Checked ${dataset.banks.length} banks, compact data integrity, and JavaScript syntax.`);
