import test from 'node:test';
import assert from 'node:assert/strict';
import { createExport, formatPlan, planScreen, rankPhages, validateBank } from '../public/planner.js';

function fixture() {
  return {
    id: 'evaluated-bank',
    name: 'Evaluated bank',
    species: 'Example bacterium',
    phages: [
      { id: 'A', cluster: 0 },
      { id: 'B', cluster: 0 },
      { id: 'C', cluster: 1 },
      { id: 'D', cluster: null },
      { id: 'E', cluster: '2' },
      { id: 'F', cluster: null },
      { id: 'G', cluster: '2' },
      { id: 'H', cluster: null },
    ],
    hosts: [{
      id: 'host-1',
      pairs: [
        { phageId: 'A', score: 0.95, observed: 0 },
        { phageId: 'B', score: 0.9, observed: 1 },
        { phageId: 'C', score: 0.8, observed: null },
        { phageId: 'D', score: 0.7, observed: 0 },
        { phageId: 'E', score: 0.6, observed: 1 },
        { phageId: 'F', score: 0.5 },
        { phageId: 'G', score: 0.4, observed: 0 },
        { phageId: 'H', score: null, observed: 1 },
      ],
    }],
  };
}

const ids = (rows) => rows.map((row) => row.phageId);

test('ranks only finite saved scores and never treats a score as a label', () => {
  const bank = fixture();
  const rows = rankPhages(bank, 'host-1');
  assert.deepEqual(ids(rows), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(rows[5].observed, null);
  assert.equal(rows[0].observed, 0);
  assert.equal(rows[0].clusterKnown, true); // Cluster zero is known.
});

test('experimental label permutation cannot change ranks, shortlist, or cocktail', () => {
  const bank = fixture();
  const original = planScreen(bank, 'host-1', 5, 3);
  const changed = structuredClone(bank);
  const labels = changed.hosts[0].pairs.map((pair) => pair.observed ?? null);
  [labels[0], labels[7]] = [labels[7], labels[0]];
  changed.hosts[0].pairs.forEach((pair, index) => { pair.observed = labels[index]; });
  const permuted = planScreen(changed, 'host-1', 5, 3);
  assert.deepEqual(ids(permuted.ranked), ids(original.ranked));
  assert.deepEqual(ids(permuted.shortlist), ids(original.shortlist));
  assert.deepEqual(ids(permuted.cocktail), ids(original.cocktail));
  assert.notDeepEqual(permuted.comparison.shortlisted, original.comparison.shortlisted);
});

test('uses score-first shortlist and known cluster diversity within budget', () => {
  const plan = planScreen(fixture(), 'host-1', 5, 3);
  assert.deepEqual(ids(plan.shortlist), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(ids(plan.cocktail), ['A', 'C', 'E']);
  assert.equal(plan.diversity.knownClusterCount, 3);
  assert.deepEqual(plan.diversity.knownClusters, [0, 1, '2']);
  assert.equal(plan.diversity.unknownClusterCount, 0);
  assert.deepEqual(plan.comparison.shortlisted, { total: 5, assayed: 4, positive: 2, negative: 2, unknown: 1 });
  // An experimentally positive phage without a saved score is still baseline evidence.
  assert.equal(plan.comparison.fullObservedPositives, 3);
  assert.equal(plan.comparison.positiveRecall, 2 / 3);
});

test('fills repeated clusters by rank when budget cannot supply distinct known groups', () => {
  const plan = planScreen(fixture(), 'host-1', 4, 4);
  assert.deepEqual(ids(plan.cocktail), ['A', 'B', 'C', 'D']);
  assert.equal(plan.diversity.knownClusterCount, 2);
  assert.equal(plan.diversity.unknownClusterCount, 1);
  assert.ok(plan.cocktail.every((row) => ids(plan.shortlist).includes(row.phageId)));
});

test('an unknown top cluster is retained but does not count as a proven distinct cluster', () => {
  const bank = fixture();
  bank.phages[0].cluster = null;
  const plan = planScreen(bank, 'host-1', 5, 3);
  assert.deepEqual(ids(plan.cocktail), ['A', 'B', 'C']);
  assert.equal(plan.diversity.knownClusterCount, 2);
  assert.equal(plan.diversity.unknownClusterCount, 1);
  bank.phages.forEach((phage) => { phage.cluster = null; });
  const noClusters = planScreen(bank, 'host-1', 5, 3);
  assert.deepEqual(ids(noClusters.cocktail), ['A', 'B', 'C']);
  assert.equal(noClusters.diversity.knownClusterCount, 0);
  assert.equal(noClusters.diversity.unknownClusterCount, 3);
});

test('numeric and string representations of a sequence cluster identify the same group', () => {
  const bank = fixture();
  bank.phages[1].cluster = '0';
  assert.deepEqual(ids(planScreen(bank, 'host-1', 3, 2).cocktail), ['A', 'C']);
});

test('score ties resolve deterministically by ID independent of source order', () => {
  const bank = fixture();
  bank.hosts[0].pairs.forEach((pair) => { pair.score = 2; });
  bank.hosts[0].pairs.reverse();
  bank.phages.reverse();
  assert.deepEqual(ids(rankPhages(bank, 'host-1')), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.deepEqual(ids(planScreen(bank, 'host-1', 5, 3).cocktail), ['A', 'C', 'E']);
});

test('one-candidate and maximum-budget boundaries produce exact requested sizes', () => {
  assert.deepEqual(ids(planScreen(fixture(), 'host-1', 1, 1).cocktail), ['A']);
  const maximum = planScreen(fixture(), 'host-1', 7, 6);
  assert.equal(maximum.shortlist.length, 7);
  assert.equal(maximum.cocktail.length, 6);
  assert.deepEqual(ids(maximum.cocktail), ['A', 'B', 'C', 'D', 'E', 'F']);
});

test('rejects invalid budgets and cocktail sizes rather than truncating or coercing', () => {
  for (const budget of [0, -1, 1.5, 8, '3', NaN, Infinity, undefined]) {
    assert.throws(() => planScreen(fixture(), 'host-1', budget, 1), /Testing budget/);
  }
  for (const size of [0, -1, 1.5, 4, '2', NaN, Infinity, undefined]) {
    assert.throws(() => planScreen(fixture(), 'host-1', 3, size), /Cocktail size/);
  }
  assert.throws(() => planScreen(fixture(), 'host-1', 7, 7), /Cocktail size/);
  const empty = fixture();
  empty.hosts[0].pairs.forEach((pair) => { pair.score = null; });
  assert.deepEqual(rankPhages(empty, 'host-1'), []);
  assert.throws(() => planScreen(empty, 'host-1', 1, 1), /Testing budget/);
});

test('zero observed positives gives undefined recall, preserving unknown outcomes', () => {
  const bank = fixture();
  bank.hosts[0].pairs.forEach((pair) => { pair.observed = null; });
  let plan = planScreen(bank, 'host-1', 4, 2);
  assert.equal(plan.comparison.positiveRecall, null);
  assert.deepEqual(plan.comparison.shortlisted, { total: 4, assayed: 0, positive: 0, negative: 0, unknown: 4 });
  bank.hosts[0].pairs.forEach((pair) => { pair.observed = 0; });
  plan = planScreen(bank, 'host-1', 4, 2);
  assert.equal(plan.comparison.positiveRecall, null);
  assert.equal(plan.comparison.shortlisted.negative, 4);
});

test('inputs stay unchanged through ranking, planning, and exporting', () => {
  const bank = fixture();
  const before = structuredClone(bank);
  const plan = planScreen(bank, 'host-1', 5, 3);
  createExport(bank, 'host-1', plan, { timestamp: '2026-10-11T18:00:00.000Z' });
  assert.deepEqual(bank, before);
});

test('exports saved-prediction provenance, reproducible selection, and retrospective labels', () => {
  const bank = fixture();
  bank.provenance = { source: 'saved-test-predictions', sha256: 'example' };
  bank.sources = [{ title: 'Research source', url: 'https://example.org/paper' }];
  const plan = planScreen(bank, 'host-1', 5, 3);
  const exported = createExport(bank, 'host-1', plan, { timestamp: '2026-10-11T18:00:00.000Z' });
  assert.equal(exported.status, 'saved_predictions');
  assert.equal(exported.candidateStatus, 'candidate_for_further_testing');
  assert.equal(exported.generatedAt, '2026-10-11T18:00:00.000Z');
  assert.equal(exported.retrospectiveComparison.purpose, 'retrospective');
  assert.deepEqual(ids(exported.candidateCocktail), ['A', 'C', 'E']);
  assert.deepEqual(exported.provenance, bank.provenance);
  assert.deepEqual(exported.sources, bank.sources);
  assert.match(exported.disclaimer, /not a validated treatment/);
  assert.deepEqual(formatPlan(bank, bank.hosts[0], plan, { timestamp: exported.generatedAt }), exported);
  assert.throws(() => createExport(bank, 'host-1', plan, { timestamp: 'invalid' }), /timestamp/);
  assert.throws(() => createExport(bank, 'host-1', { ...plan, hostId: 'different' }), /correspond/);
  // UI mutation cannot replace the selection or retrospective calculations.
  plan.cocktail = [];
  plan.comparison.positiveRecall = 1;
  const regenerated = createExport(bank, 'host-1', plan, { timestamp: exported.generatedAt });
  assert.deepEqual(regenerated, exported);
});

test('unknown hosts and malformed bank records fail clearly', () => {
  assert.throws(() => rankPhages(fixture(), 'missing'), /Unknown host/);
  assert.throws(() => validateBank(null), /bank object/);
  assert.throws(() => validateBank({ id: 'bank', phages: [], hosts: null }), /arrays/);
  const mutations = [
    [(bank) => bank.phages.push({ ...bank.phages[0] }), /Duplicate phage/],
    [(bank) => bank.hosts.push(structuredClone(bank.hosts[0])), /Duplicate host/],
    [(bank) => bank.hosts[0].pairs.push({ ...bank.hosts[0].pairs[0] }), /Duplicate pair/],
    [(bank) => { bank.hosts[0].pairs[0].phageId = 'missing'; }, /unknown phage/],
    [(bank) => { bank.hosts[0].pairs[0].score = Infinity; }, /finite/],
    [(bank) => { bank.hosts[0].pairs[0].score = '0.95'; }, /finite/],
    [(bank) => { bank.hosts[0].pairs[0].observed = 2; }, /0, 1, or null/],
    [(bank) => { bank.phages[0].cluster = {}; }, /sequence cluster/],
    [(bank) => { bank.phages[0].id = ''; }, /nonempty string/],
  ];
  for (const [mutate, expected] of mutations) {
    const bank = fixture();
    mutate(bank);
    assert.throws(() => validateBank(bank), expected);
  }
});
