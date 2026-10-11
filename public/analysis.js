import { rankPhages, validateBank } from './planner.js';

const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const knownObservation = (row) => row.observed === 0 || row.observed === 1;
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;

function hostFor(bank, hostId) {
  const host = bank.hosts.find((entry) => entry.id === hostId);
  if (!host) throw new RangeError(`Unknown host: ${hostId}.`);
  return host;
}

// Exact finite-population probability; the baseline samples without replacement.
function randomHitProbability(population, positives, budget) {
  if (!positives || !budget) return 0;
  if (budget > population - positives) return 1;
  let missProbability = 1;
  for (let draw = 0; draw < budget; draw += 1) {
    missProbability *= (population - positives - draw) / (population - draw);
  }
  return 1 - missProbability;
}

/**
 * Audit saved rank order against recorded assays at every screening budget.
 * All three curves use the same fully observed, scored cohort. Missing assays
 * are excluded rather than silently counted as negatives; observed pairs with
 * no score cannot enter the ranking and are reported separately.
 *
 * The oracle is a hindsight upper bound, never an available screening strategy.
 * Random values are analytic expectations, not a simulated or prospective result.
 */
export function buildBudgetFrontier(bank, hostId) {
  const scored = rankPhages(bank, hostId);
  const host = hostFor(bank, hostId);
  const evaluated = scored.filter(knownObservation);
  const positives = evaluated.filter((row) => row.observed === 1).length;
  const population = evaluated.length;
  let hits = 0;
  const points = evaluated.map((row, index) => {
    const budget = index + 1;
    hits += row.observed;
    const expectedHits = budget * positives / population;
    const oracleHits = Math.min(budget, positives);
    return {
      budget,
      hits,
      precision: hits / budget,
      recall: ratio(hits, positives),
      randomExpectedHits: expectedHits,
      randomExpectedPrecision: positives / population,
      randomExpectedRecall: ratio(expectedHits, positives),
      randomHitProbability: randomHitProbability(population, positives, budget),
      oracleHits,
      oraclePrecision: oracleHits / budget,
      oracleRecall: ratio(oracleHits, positives),
      hitDeltaVsRandom: hits - expectedHits,
    };
  });
  const firstBudget = (predicate) => points.find(predicate)?.budget ?? null;
  return {
    purpose: 'retrospective_budget_audit',
    bankId: bank.id,
    hostId,
    cohort: {
      scored: scored.length,
      evaluated: population,
      positives,
      negatives: population - positives,
      excludedUnknownAssay: scored.length - population,
      excludedWithoutScore: host.pairs.filter((pair) =>
        knownObservation(pair) && !Number.isFinite(pair.score)).length,
    },
    points,
    screeningBurden: {
      firstHitBudget: firstBudget((point) => point.hits > 0),
      halfRecallBudget: positives ? firstBudget((point) => point.recall >= 0.5) : null,
      allPositiveBudget: positives ? firstBudget((point) => point.hits === positives) : null,
      randomExpectedFirstHitBudget: positives ? (population + 1) / (positives + 1) : null,
    },
    interpretation: 'Budgets count scored pairs with recorded assays. Saved-rank results are retrospective; the random curve is an analytic expectation and the outcome oracle is a hindsight bound. These are not treatment outcomes.',
  };
}

/** Compare a fixed retrospective budget across every evaluated host in a bank. */
export function summarizeBankBudgets(bank, budget = 10) {
  validateBank(bank);
  if (!Number.isInteger(budget) || budget < 1) {
    throw new RangeError('Benchmark budget must be a positive integer.');
  }
  const hosts = bank.hosts.map((host) => {
    const frontier = buildBudgetFrontier(bank, host.id);
    const effectiveBudget = Math.min(budget, frontier.cohort.evaluated);
    const point = frontier.points[effectiveBudget - 1] ?? null;
    const flags = [];
    if (!frontier.cohort.evaluated) flags.push('no_recorded_assays');
    else if (!frontier.cohort.positives) flags.push('no_recorded_positives');
    else {
      if (point.hits === 0) flags.push('zero_hits_at_budget');
      if (point.hitDeltaVsRandom < 0) flags.push('below_random_expectation');
    }
    return {
      hostId: host.id,
      requestedBudget: budget,
      effectiveBudget,
      cohort: frontier.cohort,
      point,
      screeningBurden: frontier.screeningBurden,
      flags,
    };
  });
  const evaluated = hosts.filter((host) => host.point);
  const withPositives = evaluated.filter((host) => host.cohort.positives > 0);
  return {
    purpose: 'retrospective_bank_audit',
    bankId: bank.id,
    budget,
    hosts,
    summary: {
      hostCount: hosts.length,
      evaluatedHostCount: evaluated.length,
      hostsWithRecordedPositives: withPositives.length,
      zeroHitHosts: withPositives.filter((host) => host.flags.includes('zero_hits_at_budget')).length,
      belowRandomHosts: withPositives.filter((host) => host.flags.includes('below_random_expectation')).length,
      hits: evaluated.reduce((sum, host) => sum + host.point.hits, 0),
      randomExpectedHits: evaluated.reduce((sum, host) => sum + host.point.randomExpectedHits, 0),
      assays: evaluated.reduce((sum, host) => sum + host.effectiveBudget, 0),
    },
  };
}

function combinationCount(population, size, limit) {
  if (limit === 0) return null;
  const smaller = Math.min(size, population - size);
  let count = 1;
  for (let step = 1; step <= smaller; step += 1) {
    count *= (population - smaller + step) / step;
    if (count > limit) return null;
  }
  return Math.round(count);
}

function portfolioValue(indices, candidates, hostCount) {
  const best = Array(hostCount).fill(0);
  for (const index of indices) {
    candidates[index].utilities.forEach((utility, host) => {
      best[host] = Math.max(best[host], utility);
    });
  }
  return best.reduce((sum, value) => sum + value, 0) / hostCount;
}

// Candidates are ID sorted: keeping the first equal solution is deterministic.
function exactPortfolio(candidates, hostCount, size) {
  let bestIndices = [];
  let bestValue = -1;
  const selected = [];
  function visit(start) {
    if (selected.length === size) {
      const utility = portfolioValue(selected, candidates, hostCount);
      if (utility > bestValue + 1e-12) {
        bestValue = utility;
        bestIndices = [...selected];
      }
      return;
    }
    const lastStart = candidates.length - (size - selected.length);
    for (let index = start; index <= lastStart; index += 1) {
      selected.push(index);
      visit(index + 1);
      selected.pop();
    }
  }
  visit(0);
  return { indices: bestIndices, utility: bestValue };
}

/**
 * Nominate one shared phage panel for experimental screening across hosts.
 * Utility is mean(best reciprocal saved rank) across the selected hosts; each
 * host has equal weight and a missing saved pair contributes zero utility.
 * Greedy marginal gains favor complementary host rankings. For small searches
 * an exact cardinality search replaces the greedy panel with the best panel and
 * records the greedy objective as a comparison.
 *
 * This objective measures rank representation, not susceptibility, biological
 * coverage, mixture compatibility, or efficacy. Assay labels are never read by
 * the objective, greedy selection, baseline, or exact search.
 */
export function planHostPortfolio(bank, hostIds, size, options = {}) {
  validateBank(bank);
  if (!Array.isArray(hostIds) || !hostIds.length ||
      hostIds.some((id) => typeof id !== 'string' || !id.trim()) ||
      new Set(hostIds).size !== hostIds.length) {
    throw new TypeError('Portfolio hosts must be a nonempty array of distinct host IDs.');
  }
  const topRanks = options.topRanks ?? 3;
  const maxExactCombinations = options.maxExactCombinations ?? 50000;
  if (!Number.isInteger(topRanks) || topRanks < 1) {
    throw new RangeError('Top-rank window must be a positive integer.');
  }
  if (!Number.isInteger(maxExactCombinations) || maxExactCombinations < 0 || maxExactCombinations > 100000) {
    throw new RangeError('Exact-search limit must be an integer from 0 to 100000.');
  }
  const selectedHosts = [...hostIds].sort(compareIds);
  const rankMaps = selectedHosts.map((id) => {
    hostFor(bank, id);
    return new Map(rankPhages(bank, id).map((row) => [row.phageId, row.rank]));
  });
  const candidates = bank.phages
    .filter((phage) => rankMaps.some((ranks) => ranks.has(phage.id)))
    .sort((a, b) => compareIds(a.id, b.id))
    .map((phage) => ({
      phageId: phage.id,
      utilities: rankMaps.map((ranks) => ranks.has(phage.id) ? 1 / ranks.get(phage.id) : 0),
    }));
  if (!Number.isInteger(size) || size < 1 || size > candidates.length) {
    throw new RangeError(`Portfolio size must be an integer from 1 to ${candidates.length}.`);
  }
  const chosen = [];
  const steps = [];
  let utility = 0;
  while (chosen.length < size) {
    let bestIndex = -1;
    let bestValue = -1;
    candidates.forEach((candidate, index) => {
      if (chosen.includes(index)) return;
      const value = portfolioValue([...chosen, index], candidates, selectedHosts.length);
      if (value > bestValue + 1e-12) {
        bestIndex = index;
        bestValue = value;
      }
    });
    chosen.push(bestIndex);
    steps.push({ phageId: candidates[bestIndex].phageId, marginalGain: bestValue - utility, utility: bestValue });
    utility = bestValue;
  }
  const baseline = candidates.map((candidate, index) => ({
    index,
    utility: candidate.utilities.reduce((sum, value) => sum + value, 0) / selectedHosts.length,
  })).sort((a, b) => b.utility - a.utility || compareIds(candidates[a.index].phageId, candidates[b.index].phageId))
    .slice(0, size).map((candidate) => candidate.index);
  const exactCombinations = combinationCount(candidates.length, size, maxExactCombinations);
  const exact = exactCombinations === null ? null : exactPortfolio(candidates, selectedHosts.length, size);
  const selectedIndices = exact?.indices ?? chosen;
  const selectedUtility = exact?.utility ?? utility;
  const phageIds = selectedIndices.map((index) => candidates[index].phageId).sort(compareIds);
  const removalLosses = selectedIndices.map((removedIndex) => ({
    phageId: candidates[removedIndex].phageId,
    utilityLoss: Math.max(0, selectedUtility - portfolioValue(
      selectedIndices.filter((index) => index !== removedIndex), candidates, selectedHosts.length)),
  })).sort((a, b) => compareIds(a.phageId, b.phageId));
  const hostSummaries = selectedHosts.map((hostId, index) => {
    const ranked = phageIds.map((phageId) => ({ phageId, rank: rankMaps[index].get(phageId) ?? null }))
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || compareIds(a.phageId, b.phageId));
    const bestRank = ranked[0]?.rank ?? null;
    return {
      hostId,
      bestRank,
      bestPhageId: bestRank === null ? null : ranked[0].phageId,
      utility: bestRank === null ? 0 : 1 / bestRank,
      topRankRepresented: bestRank !== null && bestRank <= topRanks,
      missingSelectedPairs: ranked.filter((row) => row.rank === null).length,
    };
  });
  return {
    status: 'saved_predictions',
    candidateStatus: 'shared_panel_for_further_testing',
    bankId: bank.id,
    hostIds: selectedHosts,
    size,
    eligiblePhages: candidates.length,
    phageIds,
    utility: selectedUtility,
    removalLosses,
    hostSummaries,
    rankRepresentation: { topRanks, representedHosts: hostSummaries.filter((host) => host.topRankRepresented).length, totalHosts: hostSummaries.length },
    baseline: { method: 'highest_mean_single_phage_reciprocal_rank', phageIds: baseline.map((index) => candidates[index].phageId).sort(compareIds), utility: portfolioValue(baseline, candidates, selectedHosts.length) },
    optimization: {
      method: exact ? 'exact' : 'greedy',
      combinations: exactCombinations ?? 0,
      greedyPhageIds: chosen.map((index) => candidates[index].phageId).sort(compareIds),
      greedyUtility: utility,
      greedySteps: steps,
      exactUtility: exact?.utility ?? null,
      greedyOptimalityGap: exact ? Math.max(0, exact.utility - utility) : null,
      optimalityGap: exact ? 0 : null,
    },
    interpretation: 'Equal-weight mean of the best reciprocal saved rank on each selected host. A shared screening panel is an experimental prioritization proposal; rank representation does not establish biological coverage or cocktail efficacy. Recorded assay outcomes do not influence selection.',
  };
}
