import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSnapshotExport } from '../public/export.js';
import { CANDIDATE_DISCLAIMER, planScreen } from '../public/planner.js';

const bankBytes = await readFile(new URL('../public/data/bank.json', import.meta.url));
const dataset = JSON.parse(bankBytes);
const manifest = JSON.parse(await readFile(new URL('../public/data/provenance.json', import.meta.url), 'utf8'));
const timestamp = '2026-10-11T18:00:00.000Z';

function makeArtifact(bank = dataset.banks[0], data = dataset, provenance = manifest) {
  const hostId = bank.hosts[0].id;
  const plan = planScreen(bank, hostId, 6, 3);
  return createSnapshotExport(data, provenance, bank.id, hostId, plan, { timestamp });
}

test('each bank export contains its exact source IDs and selected source attribution', () => {
  for (const bank of dataset.banks) {
    const artifact = makeArtifact(bank);
    assert.equal(artifact.bank.id, bank.id);
    assert.equal(artifact.bank.name, bank.name);
    assert.equal(artifact.host.id, bank.hosts[0].id);
    assert.deepEqual(artifact.sourceIds, bank.sourceIds);
    const expectedSources = manifest.sources.filter((source) => bank.sourceIds.includes(source.id));
    assert.deepEqual(artifact.sources, expectedSources);
    assert.deepEqual(artifact.sources.map((source) => source.id).sort(), [...bank.sourceIds].sort());
    assert.equal(artifact.datasetVersion, dataset.datasetVersion);
    assert.equal(artifact.model, bank.model);
    assert.equal(artifact.evaluationMode, bank.evaluationMode);
  }
});

test('portable artifact retains the complete consumed snapshot manifest and hashes', () => {
  const artifact = makeArtifact();
  assert.deepEqual(artifact.provenance, { ...manifest, sourceManifest: './data/provenance.json' });
  assert.deepEqual(artifact.provenance.files, manifest.files);
  assert.deepEqual(artifact.provenance.sources, manifest.sources);
  const snapshot = artifact.provenance.generatedFiles.find((file) => file.path === 'public/data/bank.json');
  assert.equal(snapshot.sha256, createHash('sha256').update(bankBytes).digest('hex'));
  assert.equal(snapshot.bytes, bankBytes.length);
  for (const sourceFile of artifact.provenance.files) {
    assert.match(sourceFile.sha256, /^[a-f0-9]{64}$/);
  }
  assert.doesNotMatch(JSON.stringify(artifact), /\b[a-z]:[\\/]|full_pipeline/i);
});

test('artifact preserves saved-score limitations and retrospective candidate disclaimers', () => {
  for (const bank of dataset.banks) {
    const artifact = makeArtifact(bank);
    assert.equal(artifact.status, 'saved_predictions');
    assert.equal(artifact.candidateStatus, 'candidate_for_further_testing');
    assert.equal(artifact.retrospectiveComparison.purpose, 'retrospective');
    assert.equal(artifact.disclaimer, CANDIDATE_DISCLAIMER);
    assert.match(artifact.disclaimer, /not a validated treatment/);
    assert.equal(artifact.scoreMeaning, bank.scoreMeaning);
    assert.equal(artifact.observationMeaning, bank.observationMeaning);
    assert.deepEqual(artifact.limitations, bank.limitations);
    assert.match(artifact.method.observations, /never used for ranking or selection/);
  }
});

test('snapshot export preserves timestamp and recomputes candidates from saved data', () => {
  const bank = dataset.banks[0];
  const hostId = bank.hosts[0].id;
  const plan = planScreen(bank, hostId, 6, 3);
  const expectedIds = plan.cocktail.map((row) => row.phageId);
  plan.cocktail = [{ phageId: 'invented', score: 1 }];
  plan.shortlist = [];
  plan.comparison.positiveRecall = 1;
  const artifact = createSnapshotExport(dataset, manifest, bank.id, hostId, plan, { timestamp });
  assert.equal(artifact.generatedAt, timestamp);
  assert.deepEqual(artifact.candidateCocktail.map((row) => row.phageId), expectedIds);
  assert.equal(artifact.shortlist.length, 6);
  assert.equal(artifact.retrospectiveComparison.positiveRecall, planScreen(bank, hostId, 6, 3).comparison.positiveRecall);
  assert.throws(() => createSnapshotExport(dataset, manifest, bank.id, hostId, plan, { timestamp: 'invalid' }), /timestamp/);
});

test('creating or editing an artifact cannot mutate bank data or the source manifest', () => {
  const beforeData = structuredClone(dataset);
  const beforeManifest = structuredClone(manifest);
  const artifact = makeArtifact();
  assert.deepEqual(dataset, beforeData);
  assert.deepEqual(manifest, beforeManifest);
  artifact.limitations.push('edited after export');
  artifact.sourceIds.push('edited');
  artifact.sources[0].title = 'edited title';
  artifact.provenance.files[0].sha256 = 'edited hash';
  artifact.provenance.sources[0].title = 'edited manifest title';
  artifact.candidateCocktail[0].score = -1;
  assert.deepEqual(dataset, beforeData);
  assert.deepEqual(manifest, beforeManifest);
});

test('version mismatch, missing sources, and ambiguous metadata fail clearly', () => {
  assert.throws(() => makeArtifact(dataset.banks[0], dataset, { ...manifest, datasetVersion: 'different' }), /version.*match/i);
  assert.throws(() => makeArtifact(dataset.banks[0], { ...dataset, datasetVersion: undefined }), /version.*match/i);
  const bank = dataset.banks[0];
  const missing = structuredClone(manifest);
  missing.sources = missing.sources.filter((source) => source.id !== bank.sourceIds[0]);
  assert.throws(() => makeArtifact(bank, dataset, missing), /missing source/);
  const duplicateManifest = structuredClone(manifest);
  duplicateManifest.sources.push({ ...duplicateManifest.sources[0] });
  assert.throws(() => makeArtifact(bank, dataset, duplicateManifest), /IDs must be distinct/);
  const duplicateBank = { ...dataset, banks: [...dataset.banks, bank] };
  assert.throws(() => makeArtifact(bank, duplicateBank), /Ambiguous bank/);
  const invalidIds = structuredClone(dataset);
  invalidIds.banks[0].sourceIds.push(invalidIds.banks[0].sourceIds[0]);
  assert.throws(() => makeArtifact(bank, invalidIds), /distinct source IDs/);
  assert.throws(() => makeArtifact(bank, { ...dataset, schemaVersion: 2 }), /supported saved bank/);
  assert.throws(() => makeArtifact(bank, dataset, { ...manifest, schemaVersion: 2 }), /supported source manifest/);
});

test('unknown bank and mismatched host/plan selection cannot export misleading candidates', () => {
  const bank = dataset.banks[0];
  const hostId = bank.hosts[0].id;
  const plan = planScreen(bank, hostId, 6, 3);
  assert.throws(() => createSnapshotExport(dataset, manifest, 'missing', hostId, plan), /Unknown bank/);
  assert.throws(() => createSnapshotExport(dataset, manifest, bank.id, 'missing', plan), /Unknown host/);
  assert.throws(() => createSnapshotExport(dataset, manifest, dataset.banks[1].id, dataset.banks[1].hosts[0].id, plan), /correspond/);
  assert.throws(() => createSnapshotExport(dataset, manifest, bank.id, bank.hosts[1].id, plan), /correspond/);
});
