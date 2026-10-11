import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createExport, planScreen, rankPhages, validateBank } from '../public/planner.js';

const bankBytes = await readFile(new URL('../public/data/bank.json', import.meta.url));
const dataset = JSON.parse(bankBytes);
const provenance = JSON.parse(await readFile(new URL('../public/data/provenance.json', import.meta.url), 'utf8'));
const expected = {
  'basel-ecor': { hosts: 25, phages: 52, pairs: 1240, positive: 302, negative: 938, missing: 60 },
  pseudomonas: { hosts: 23, phages: 19, pairs: 437, positive: 158, negative: 279, missing: 0 },
};
const rowIds = (rows) => rows.map((row) => row.phageId);

test('compact data contains the two evaluated banks and passes planner validation', () => {
  assert.equal(dataset.schemaVersion, 1);
  assert.equal(provenance.schemaVersion, 1);
  assert.equal(dataset.datasetVersion, provenance.datasetVersion);
  assert.deepEqual(dataset.banks.map((bank) => bank.id).sort(), Object.keys(expected).sort());
  for (const bank of dataset.banks) {
    assert.equal(validateBank(bank), true, bank.id);
    assert.match(bank.predictionMode, /saved/i);
    assert.match(bank.scoreMeaning, /(?:not.*probability|calibration.*not.*established)/i);
    assert.ok(bank.limitations.length > 0, `${bank.id} must explain its research limitations`);
  }
});

test('published bank statistics match actual saved pairs and explicit binary observations', () => {
  for (const bank of dataset.banks) {
    const pairs = bank.hosts.flatMap((host) => host.pairs);
    const actual = {
      hosts: bank.hosts.length,
      phages: bank.phages.length,
      pairs: pairs.length,
      positive: pairs.filter((pair) => pair.observed === 1).length,
      negative: pairs.filter((pair) => pair.observed === 0).length,
      missing: bank.hosts.length * bank.phages.length - pairs.length,
    };
    assert.deepEqual(actual, expected[bank.id], `${bank.id} fixture cardinality changed`);
    assert.deepEqual(bank.statistics, actual, `${bank.id} metadata must describe its records`);
    assert.ok(pairs.every((pair) => pair.observed === 0 || pair.observed === 1), `${bank.id} has an invalid recorded label`);
    assert.ok(pairs.every((pair) => typeof pair.score === 'number' && Number.isFinite(pair.score)), `${bank.id} has a non-finite saved score`);
  }
  const basel = dataset.banks.find((bank) => bank.id === 'basel-ecor');
  const ecor12 = basel.hosts.find((host) => host.id === 'ECOR12');
  assert.deepEqual(ecor12.pairs.find((pair) => pair.phageId === 'Bas01'), { phageId: 'Bas01', score: 0.9989128, observed: 0 });
  assert.deepEqual(ecor12.pairs.find((pair) => pair.phageId === 'Bas35'), { phageId: 'Bas35', score: 0.99454653, observed: 1 });
});

test('bank bytes match the SHA-256 and byte count in the generated-file manifest', () => {
  const entry = provenance.generatedFiles.find((file) => file.path === 'public/data/bank.json');
  assert.ok(entry, 'Bank data must have a generated-file manifest entry');
  assert.equal(entry.bytes, bankBytes.length);
  assert.equal(entry.sha256, createHash('sha256').update(bankBytes).digest('hex'));
  for (const file of provenance.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(file.bytes) && file.bytes > 0);
    assert.doesNotMatch(file.path, /^(?:[a-z]:[\\/]|[\\/])/i, 'Research provenance paths must be relative');
  }
});

test('all bank citation IDs resolve to distinct primary source entries', () => {
  const sourceIds = provenance.sources.map((source) => source.id);
  assert.equal(new Set(sourceIds).size, sourceIds.length, 'Source IDs must be unique');
  const byId = new Map(provenance.sources.map((source) => [source.id, source]));
  for (const bank of dataset.banks) {
    assert.ok(bank.sourceIds.length > 0, `${bank.id} requires citations`);
    for (const sourceId of bank.sourceIds) {
      const source = byId.get(sourceId);
      assert.ok(source, `${bank.id} references missing citation ${sourceId}`);
      assert.ok(source.title.length > 0);
      assert.equal(new URL(source.url).protocol, 'https:');
    }
  }
});

test('every actual host supports minimum/maximum budgets and all allowed cocktail sizes without altering labels', () => {
  const before = JSON.stringify(dataset);
  for (const bank of dataset.banks) {
    for (const host of bank.hosts) {
      const context = `${bank.id}/${host.id}`;
      const ranked = rankPhages(bank, host.id);
      assert.equal(ranked.length, host.pairs.length, context);
      const observations = new Map(host.pairs.map((pair) => [pair.phageId, pair.observed]));
      const positives = host.pairs.filter((pair) => pair.observed === 1).length;
      for (const budget of new Set([1, ranked.length])) {
        for (let cocktailSize = 1; cocktailSize <= Math.min(budget, 6); cocktailSize += 1) {
          const plan = planScreen(bank, host.id, budget, cocktailSize);
          assert.equal(plan.shortlist.length, budget, context);
          assert.equal(plan.cocktail.length, cocktailSize, context);
          assert.deepEqual(rowIds(plan.shortlist), rowIds(ranked.slice(0, budget)), context);
          const shortlistIds = new Set(rowIds(plan.shortlist));
          assert.ok(plan.cocktail.every((row) => shortlistIds.has(row.phageId)), context);
          assert.equal(new Set(rowIds(plan.cocktail)).size, cocktailSize, context);
          assert.equal(plan.cocktail[0].phageId, ranked[0].phageId, context);
          assert.ok(plan.cocktail.every((row) => row.observed === observations.get(row.phageId)), context);
          assert.equal(plan.comparison.fullObservedPositives, positives, context);
          const shortlistPositive = plan.shortlist.filter((row) => observations.get(row.phageId) === 1).length;
          assert.equal(plan.comparison.shortlistedObservedPositives, shortlistPositive, context);
          assert.equal(plan.comparison.positiveRecall, positives === 0 ? null : shortlistPositive / positives, context);
          assert.equal(plan.comparison.shortlisted.unknown, 0, context);
          assert.ok(plan.diversity.knownClusterCount <= cocktailSize, context);
        }
      }
    }
  }
  assert.equal(JSON.stringify(dataset), before, 'Planning must preserve all saved scores and recorded labels');
});

test('actual exported candidate artifacts clearly label evidence and contain no absolute research paths', () => {
  for (const bank of dataset.banks) {
    const host = bank.hosts[0];
    const plan = planScreen(bank, host.id, 6, 3);
    const artifact = createExport(bank, host.id, plan, { timestamp: '2026-10-11T18:00:00.000Z' });
    assert.equal(artifact.status, 'saved_predictions');
    assert.equal(artifact.candidateStatus, 'candidate_for_further_testing');
    assert.equal(artifact.retrospectiveComparison.purpose, 'retrospective');
    assert.match(artifact.disclaimer, /not a validated treatment/);
    assert.deepEqual(rowIds(artifact.candidateCocktail), rowIds(plan.cocktail));
    const serialized = JSON.stringify(artifact);
    assert.doesNotMatch(serialized, /[a-z]:[\\/]/i, 'Artifacts must not expose Windows absolute paths');
    assert.doesNotMatch(serialized, /full_pipeline/i, 'Artifacts must not leak the private research checkout');
  }
});
