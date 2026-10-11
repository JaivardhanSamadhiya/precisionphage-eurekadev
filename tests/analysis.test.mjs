import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildBudgetFrontier, summarizeBankBudgets, planHostPortfolio } from '../public/analysis.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);

function screeningBank() {
  return {
    id: 'screening-bank',
    phages: ['A', 'B', 'C', 'D'].map((id) => ({ id })),
    hosts: [{ id: 'H1', pairs: [
      { phageId: 'A', score: 4, observed: 0 },
      { phageId: 'B', score: 3, observed: 1 },
      { phageId: 'C', score: 2, observed: 0 },
      { phageId: 'D', score: 1, observed: 1 },
    ] }],
  };
}

function portfolioBank() {
  return {
    id: 'portfolio-bank',
    phages: ['A', 'B', 'C'].map((id) => ({ id })),
    hosts: [
      { id: 'H1', pairs: [
        { phageId: 'A', score: 3, observed: 0 },
        { phageId: 'B', score: 2, observed: 1 },
        { phageId: 'C', score: 1, observed: 0 },
      ] },
      { id: 'H2', pairs: [
        { phageId: 'A', score: 1, observed: 1 },
        { phageId: 'B', score: 3, observed: 0 },
        { phageId: 'C', score: 2, observed: 1 },
      ] },
      { id: 'H3', pairs: [
        { phageId: 'A', score: 2, observed: 0 },
        { phageId: 'B', score: 1, observed: 1 },
        { phageId: 'C', score: 3, observed: 0 },
      ] },
    ],
  };
}

test('budget frontier compares saved order with analytic random and hindsight bound', () => {
  const frontier = buildBudgetFrontier(screeningBank(), 'H1');
  assert.deepEqual(frontier.points.map((point) => point.hits), [0, 1, 1, 2]);
  assert.deepEqual(frontier.points.map((point) => point.randomExpectedHits), [0.5, 1, 1.5, 2]);
  assert.deepEqual(frontier.points.map((point) => point.oracleHits), [1, 2, 2, 2]);
  assert.equal(frontier.points[1].precision, 0.5);
  assert.equal(frontier.points[1].recall, 0.5);
  assert.equal(frontier.points[1].randomExpectedPrecision, 0.5);
  assert.equal(frontier.points[1].randomExpectedRecall, 0.5);
  assert.equal(frontier.points[1].oraclePrecision, 1);
  assert.equal(frontier.points[1].oracleRecall, 1);
  assert.equal(frontier.points[2].hitDeltaVsRandom, -0.5);
  assert.deepEqual(frontier.screeningBurden, {
    firstHitBudget: 2, halfRecallBudget: 2, allPositiveBudget: 4, randomExpectedFirstHitBudget: 5 / 3,
  });
  assert.match(frontier.interpretation, /hindsight/);
});

test('random hit probability matches all equally likely combinations, without replacement', () => {
  const points = buildBudgetFrontier(screeningBank(), 'H1').points;
  near(points[0].randomHitProbability, 1 / 2);
  // Five of the six size-two subsets contain B or D.
  near(points[1].randomHitProbability, 5 / 6);
  assert.equal(points[2].randomHitProbability, 1);
  assert.equal(points[3].randomHitProbability, 1);
});

test('missing outcomes and scores are reported and excluded from the shared evaluation cohort', () => {
  const bank = screeningBank();
  bank.phages.push({ id: 'E' }, { id: 'F' });
  bank.hosts[0].pairs.push(
    { phageId: 'E', score: 8, observed: null },
    { phageId: 'F', score: null, observed: 1 },
  );
  const frontier = buildBudgetFrontier(bank, 'H1');
  assert.deepEqual(frontier.cohort, {
    scored: 5, evaluated: 4, positives: 2, negatives: 2, excludedUnknownAssay: 1, excludedWithoutScore: 1,
  });
  assert.deepEqual(frontier.points.map((point) => point.hits), [0, 1, 1, 2]);
  assert.equal(frontier.screeningBurden.firstHitBudget, 2);
});

test('no-positive and unknown-only hosts preserve undefined recall and screening burden', () => {
  const bank = screeningBank();
  bank.hosts[0].pairs.forEach((pair) => { pair.observed = 0; });
  const negative = buildBudgetFrontier(bank, 'H1');
  for (const point of negative.points) {
    assert.equal(point.precision, 0);
    assert.equal(point.recall, null);
    assert.equal(point.randomExpectedRecall, null);
    assert.equal(point.oracleRecall, null);
    assert.equal(point.randomHitProbability, 0);
  }
  assert.equal(negative.screeningBurden.firstHitBudget, null);
  assert.equal(negative.screeningBurden.randomExpectedFirstHitBudget, null);
  bank.hosts[0].pairs.forEach((pair) => { pair.observed = null; });
  const unknown = buildBudgetFrontier(bank, 'H1');
  assert.deepEqual(unknown.points, []);
  assert.equal(unknown.cohort.excludedUnknownAssay, 4);
  assert.equal(unknown.screeningBurden.halfRecallBudget, null);
});

test('single positive and fully positive cohorts respect endpoints', () => {
  const bank = screeningBank();
  bank.hosts[0].pairs = [bank.hosts[0].pairs[1]];
  const singleton = buildBudgetFrontier(bank, 'H1');
  assert.equal(singleton.points[0].precision, 1);
  assert.equal(singleton.points[0].randomHitProbability, 1);
  assert.equal(singleton.screeningBurden.randomExpectedFirstHitBudget, 1);
  const full = screeningBank();
  full.hosts[0].pairs.forEach((pair) => { pair.observed = 1; });
  const points = buildBudgetFrontier(full, 'H1').points;
  assert.ok(points.every((point) => point.precision === 1 && point.randomHitProbability === 1));
  assert.equal(points[3].recall, 1);
});

test('bank audit separates ranking failures from hosts with no positive evidence', () => {
  const bank = screeningBank();
  bank.hosts.push({ id: 'H0', pairs: bank.hosts[0].pairs.map((pair) => ({ ...pair, observed: 0 })) });
  bank.hosts.push({ id: 'HU', pairs: bank.hosts[0].pairs.map((pair) => ({ ...pair, observed: null })) });
  const audit = summarizeBankBudgets(bank, 1);
  assert.deepEqual(audit.hosts[0].flags, ['zero_hits_at_budget', 'below_random_expectation']);
  assert.deepEqual(audit.hosts[1].flags, ['no_recorded_positives']);
  assert.deepEqual(audit.hosts[2].flags, ['no_recorded_assays']);
  assert.deepEqual(audit.summary, {
    hostCount: 3, evaluatedHostCount: 2, hostsWithRecordedPositives: 1,
    zeroHitHosts: 1, belowRandomHosts: 1, hits: 0, randomExpectedHits: 0.5, assays: 2,
  });
  const oversized = summarizeBankBudgets(bank, 50);
  assert.equal(oversized.hosts[0].effectiveBudget, 4);
  assert.equal(oversized.hosts[0].point.recall, 1);
  for (const budget of [0, -1, 1.5, '2', NaN]) {
    assert.throws(() => summarizeBankBudgets(bank, budget), /positive integer/);
  }
});

test('shared portfolio optimizes complementarity using reciprocal ranks', () => {
  const bank = portfolioBank();
  const one = planHostPortfolio(bank, ['H1', 'H2', 'H3'], 1);
  assert.deepEqual(one.phageIds, ['A']);
  near(one.utility, 11 / 18);
  const two = planHostPortfolio(bank, ['H1', 'H2', 'H3'], 2, { topRanks: 1 });
  assert.deepEqual(two.phageIds, ['A', 'B']);
  near(two.utility, 5 / 6);
  assert.deepEqual(two.hostSummaries.map((host) => host.bestRank), [1, 1, 2]);
  assert.equal(two.rankRepresentation.representedHosts, 2);
  assert.equal(two.optimization.combinations, 3);
  near(two.optimization.exactUtility, 5 / 6);
  assert.equal(two.optimization.optimalityGap, 0);
  assert.ok(two.optimization.greedySteps[1].marginalGain > 0);
});

test('permuting recorded observations cannot alter any shared portfolio result', () => {
  const bank = portfolioBank();
  const original = planHostPortfolio(bank, ['H1', 'H2', 'H3'], 2);
  bank.hosts.forEach((host) => host.pairs.forEach((pair) => { pair.observed = pair.observed === 1 ? 0 : 1; }));
  assert.deepEqual(planHostPortfolio(bank, ['H1', 'H2', 'H3'], 2), original);
  bank.hosts.forEach((host) => host.pairs.forEach((pair) => { pair.observed = null; }));
  assert.deepEqual(planHostPortfolio(bank, ['H1', 'H2', 'H3'], 2), original);
});

test('monotone score transformations and source ordering cannot change rank utility', () => {
  const bank = portfolioBank();
  const original = planHostPortfolio(bank, ['H1', 'H2', 'H3'], 2);
  bank.hosts.reverse();
  bank.phages.reverse();
  bank.hosts.forEach((host) => {
    host.pairs.reverse();
    host.pairs.forEach((pair) => { pair.score = Math.exp(pair.score); });
  });
  assert.deepEqual(planHostPortfolio(bank, ['H3', 'H2', 'H1'], 2), original);
});

test('missing saved pairs contribute zero rank utility and never invent representation', () => {
  const bank = portfolioBank();
  bank.hosts[2].pairs = [];
  const panel = planHostPortfolio(bank, ['H1', 'H2', 'H3'], 2);
  assert.deepEqual(panel.phageIds, ['A', 'B']);
  near(panel.utility, 2 / 3);
  const missing = panel.hostSummaries.find((host) => host.hostId === 'H3');
  assert.equal(missing.bestRank, null);
  assert.equal(missing.bestPhageId, null);
  assert.equal(missing.utility, 0);
  assert.equal(missing.missingSelectedPairs, 2);
  assert.equal(missing.topRankRepresented, false);
});

test('member removal losses expose redundant slots when rank utility has saturated', () => {
  const bank = portfolioBank();
  const panel = planHostPortfolio(bank, ['H1'], 2);
  assert.equal(panel.utility, 1);
  assert.deepEqual(panel.removalLosses, [
    { phageId: 'A', utilityLoss: 0.5 },
    { phageId: 'B', utilityLoss: 0 },
  ]);
  const one = planHostPortfolio(bank, ['H1'], 1);
  assert.deepEqual(one.removalLosses, [{ phageId: 'A', utilityLoss: 1 }]);
});

test('exact search is bounded and can be explicitly disabled', () => {
  const bank = portfolioBank();
  for (const limit of [0, 2]) {
    const panel = planHostPortfolio(bank, ['H1', 'H2'], 2, { maxExactCombinations: limit });
    assert.equal(panel.optimization.method, 'greedy');
    assert.equal(panel.optimization.exactUtility, null);
    assert.equal(panel.optimization.optimalityGap, null);
    assert.equal(panel.optimization.combinations, 0);
  }
  assert.equal(planHostPortfolio(bank, ['H1'], 3, { maxExactCombinations: 0 }).optimization.method, 'greedy');
  assert.equal(planHostPortfolio(bank, ['H1'], 3).optimization.combinations, 1);
});

test('exact audit agrees with an independently computed exhaustive small-bank optimum', () => {
  // Exhaust every size-two panel in a four-phage ranking system.
  const bank = screeningBank();
  bank.hosts.push({ id: 'H2', pairs: [
    { phageId: 'A', score: 1, observed: 0 }, { phageId: 'B', score: 2, observed: 0 },
    { phageId: 'C', score: 4, observed: 0 }, { phageId: 'D', score: 3, observed: 0 },
  ] });
  const ranks = { A: [1, 4], B: [2, 3], C: [3, 1], D: [4, 2] };
  const ids = Object.keys(ranks);
  const values = [];
  for (let first = 0; first < ids.length; first += 1) {
    for (let second = first + 1; second < ids.length; second += 1) {
      const value = [0, 1].reduce((sum, host) =>
        sum + Math.max(1 / ranks[ids[first]][host], 1 / ranks[ids[second]][host]), 0) / 2;
      values.push(value);
    }
  }
  const panel = planHostPortfolio(bank, ['H1', 'H2'], 2);
  assert.equal(panel.optimization.combinations, 6);
  near(panel.optimization.exactUtility, Math.max(...values));
  assert.deepEqual(panel.phageIds, ['A', 'C']);
});

test('exact selection improves a greedy panel with a locally attractive first choice', () => {
  const orders = [
    ['D', 'E', 'F', 'C', 'A', 'B'],
    ['F', 'A', 'B', 'D', 'E', 'C'],
    ['C', 'F', 'B', 'E', 'A', 'D'],
    ['C', 'F', 'B', 'E', 'A', 'D'],
    ['D', 'F', 'E', 'B', 'C', 'A'],
  ];
  const bank = {
    id: 'complementary-ranks',
    phages: ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => ({ id })),
    hosts: orders.map((order, index) => ({
      id: `H${index}`,
      pairs: order.map((phageId, rank) => ({ phageId, score: 6 - rank, observed: 0 })),
    })),
  };
  const selectedHosts = bank.hosts.map((host) => host.id);
  const exact = planHostPortfolio(bank, selectedHosts, 2);
  const greedy = planHostPortfolio(bank, selectedHosts, 2, { maxExactCombinations: 0 });
  assert.deepEqual(greedy.phageIds, ['D', 'F']);
  assert.deepEqual(exact.phageIds, ['C', 'D']);
  near(greedy.utility, 0.8);
  near(exact.utility, 0.85);
  near(exact.optimization.greedyOptimalityGap, 0.05);
  assert.equal(exact.optimization.optimalityGap, 0);
  assert.equal(exact.optimization.combinations, 15);
});

test('analysis validates inputs and leaves banks unchanged', () => {
  const bank = portfolioBank();
  const before = structuredClone(bank);
  buildBudgetFrontier(bank, 'H1');
  summarizeBankBudgets(bank, 2);
  planHostPortfolio(bank, ['H1', 'H2'], 2);
  assert.deepEqual(bank, before);
  assert.throws(() => buildBudgetFrontier(bank, 'missing'), /Unknown host/);
  for (const hosts of [[], ['H1', 'H1'], ['missing'], [''], null]) {
    assert.throws(() => planHostPortfolio(bank, hosts, 1), /hosts|Unknown host/);
  }
  for (const size of [0, -1, 4, '2', 1.5, NaN]) {
    assert.throws(() => planHostPortfolio(bank, ['H1'], size), /Portfolio size/);
  }
  assert.throws(() => planHostPortfolio(bank, ['H1'], 1, { topRanks: 0 }), /Top-rank window/);
  assert.throws(() => planHostPortfolio(bank, ['H1'], 1, { maxExactCombinations: 100001 }), /Exact-search limit/);
});

test('saved-data frontier endpoints conserve recorded positives for every host', async () => {
  const dataset = JSON.parse(await readFile(new URL('../public/data/bank.json', import.meta.url), 'utf8'));
  for (const bank of dataset.banks) {
    for (const host of bank.hosts) {
      const frontier = buildBudgetFrontier(bank, host.id);
      const end = frontier.points.at(-1);
      assert.ok(end, `${bank.id}/${host.id} should have an evaluated pair`);
      assert.equal(end.hits, frontier.cohort.positives);
      near(end.randomExpectedHits, frontier.cohort.positives);
      assert.equal(end.oracleHits, frontier.cohort.positives);
      assert.equal(end.recall, frontier.cohort.positives ? 1 : null);
      assert.ok(frontier.points.every((point) => point.hits <= point.oracleHits));
      assert.ok(frontier.points.every((point, index) => !index || point.hits >= frontier.points[index - 1].hits));
    }
  }
});

test('actual banks respect the exact-search cap and preserve label independence in shared panels', async () => {
  const dataset = JSON.parse(await readFile(new URL('../public/data/bank.json', import.meta.url), 'utf8'));
  for (const bank of dataset.banks) {
    const hosts = bank.hosts.slice(0, 3).map((host) => host.id);
    const original = planHostPortfolio(bank, hosts, 6);
    const expectedCombinations = bank.phages.length === 19 ? 27132 : 0;
    assert.equal(original.optimization.combinations, expectedCombinations);
    assert.equal(original.phageIds.length, 6);
    const changed = structuredClone(bank);
    changed.hosts.forEach((host) => host.pairs.forEach((pair) => { pair.observed = null; }));
    assert.deepEqual(planHostPortfolio(changed, hosts, 6), original);
  }
});

