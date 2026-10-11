/**
 * Deterministic planning over saved predictions. Experimental observations are
 * retrospective context and never influence ranking or cocktail selection.
 */
export const CANDIDATE_DISCLAIMER =
  'These results use saved research predictions. The proposed cocktail is a candidate for further laboratory testing, not a validated treatment. Sequence-cluster diversity does not establish independent activity or treatment efficacy.';

const asciiCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const hasKnownCluster = (cluster) => cluster !== null && cluster !== undefined;
const clusterKey = (cluster) => String(cluster);

function requireId(value, context) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${context} must be a nonempty string.`);
  }
}

/** Validate one evaluated bank without changing its input records. */
export function validateBank(bank) {
  if (!bank || typeof bank !== 'object' || Array.isArray(bank)) {
    throw new TypeError('A bank object is required.');
  }
  requireId(bank.id, 'Bank ID');
  if (!Array.isArray(bank.phages) || !Array.isArray(bank.hosts)) {
    throw new TypeError('Bank phages and hosts must be arrays.');
  }
  const phageIds = new Set();
  for (const phage of bank.phages) {
    if (!phage || typeof phage !== 'object') {
      throw new TypeError('Each phage must be an object.');
    }
    requireId(phage.id, 'Phage ID');
    if (phageIds.has(phage.id)) throw new TypeError(`Duplicate phage ID: ${phage.id}.`);
    phageIds.add(phage.id);
    if (hasKnownCluster(phage.cluster)) {
      const validNumber = typeof phage.cluster === 'number' && Number.isFinite(phage.cluster);
      const validString = typeof phage.cluster === 'string' && phage.cluster.trim().length > 0;
      if (!validNumber && !validString) {
        throw new TypeError(`Invalid sequence cluster for phage ${phage.id}.`);
      }
    }
  }
  const hostIds = new Set();
  for (const host of bank.hosts) {
    if (!host || typeof host !== 'object') throw new TypeError('Each host must be an object.');
    requireId(host.id, 'Host ID');
    if (hostIds.has(host.id)) throw new TypeError(`Duplicate host ID: ${host.id}.`);
    hostIds.add(host.id);
    if (!Array.isArray(host.pairs)) throw new TypeError(`Host ${host.id} pairs must be an array.`);
    const pairedIds = new Set();
    for (const pair of host.pairs) {
      if (!pair || typeof pair !== 'object') throw new TypeError('Each host-phage pair must be an object.');
      requireId(pair.phageId, 'Pair phage ID');
      if (!phageIds.has(pair.phageId)) {
        throw new TypeError(`Host ${host.id} references unknown phage ${pair.phageId}.`);
      }
      if (pairedIds.has(pair.phageId)) {
        throw new TypeError(`Duplicate pair for host ${host.id} and phage ${pair.phageId}.`);
      }
      pairedIds.add(pair.phageId);
      if (pair.score !== undefined && pair.score !== null &&
          (typeof pair.score !== 'number' || !Number.isFinite(pair.score))) {
        throw new TypeError(`Score for ${host.id}/${pair.phageId} must be finite or null.`);
      }
      if (pair.observed !== undefined && pair.observed !== null && pair.observed !== 0 && pair.observed !== 1) {
        throw new TypeError(`Observation for ${host.id}/${pair.phageId} must be 0, 1, or null.`);
      }
    }
  }
  return true;
}

function findHost(bank, hostId) {
  requireId(hostId, 'Host ID');
  const host = bank.hosts.find((entry) => entry.id === hostId);
  if (!host) throw new RangeError(`Unknown host: ${hostId}.`);
  return host;
}

function rankedRows(bank, host) {
  const phages = new Map(bank.phages.map((phage) => [phage.id, phage]));
  return host.pairs
    .filter((pair) => typeof pair.score === 'number' && Number.isFinite(pair.score))
    .map((pair) => {
      const phage = phages.get(pair.phageId);
      return {
        id: phage.id,
        phageId: phage.id,
        name: phage.name || phage.id,
        score: pair.score,
        observed: pair.observed ?? null,
        cluster: phage.cluster ?? null,
        clusterKnown: hasKnownCluster(phage.cluster),
      };
    })
    .sort((a, b) => b.score - a.score || asciiCompare(a.phageId, b.phageId))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Rank finite saved scores descending, breaking ties by phage ID. */
export function rankPhages(bank, hostId) {
  validateBank(bank);
  return rankedRows(bank, findHost(bank, hostId));
}

function summarizeObservations(rows) {
  const positive = rows.filter((row) => row.observed === 1).length;
  const negative = rows.filter((row) => row.observed === 0).length;
  return {
    total: rows.length,
    assayed: positive + negative,
    positive,
    negative,
    unknown: rows.length - positive - negative,
  };
}

function chooseCocktail(shortlist, cocktailSize) {
  const selected = [shortlist[0]];
  const selectedIds = new Set([shortlist[0].phageId]);
  const representedClusters = new Set();
  if (shortlist[0].clusterKnown) representedClusters.add(clusterKey(shortlist[0].cluster));
  for (const row of shortlist) {
    if (selected.length === cocktailSize) break;
    if (selectedIds.has(row.phageId) || !row.clusterKnown) continue;
    const key = clusterKey(row.cluster);
    if (representedClusters.has(key)) continue;
    selected.push(row);
    selectedIds.add(row.phageId);
    representedClusters.add(key);
  }
  for (const row of shortlist) {
    if (selected.length === cocktailSize) break;
    if (selectedIds.has(row.phageId)) continue;
    selected.push(row);
    selectedIds.add(row.phageId);
  }
  return selected.sort((a, b) => a.rank - b.rank);
}

/**
 * Allocate a testing shortlist, then nominate a score/sequence-diversity
 * cocktail drawn only from that shortlist. Unknown clusters are not counted
 * as evidence of distinct sequence groups.
 */
export function planScreen(bank, hostId, budget, cocktailSize) {
  validateBank(bank);
  const host = findHost(bank, hostId);
  const ranked = rankedRows(bank, host);
  if (!Number.isInteger(budget) || budget < 1 || budget > ranked.length) {
    throw new RangeError(`Testing budget must be an integer from 1 to ${ranked.length}.`);
  }
  const maximumSize = Math.min(budget, 6);
  if (!Number.isInteger(cocktailSize) || cocktailSize < 1 || cocktailSize > maximumSize) {
    throw new RangeError(`Cocktail size must be an integer from 1 to ${maximumSize}.`);
  }
  const shortlist = ranked.slice(0, budget);
  const cocktail = chooseCocktail(shortlist, cocktailSize);
  const shortlistedObservations = summarizeObservations(shortlist);
  const fullObservations = summarizeObservations(host.pairs);
  const knownClusters = [...new Map(cocktail
    .filter((row) => row.clusterKnown)
    .map((row) => [clusterKey(row.cluster), row.cluster])).values()];
  return {
    status: 'saved_predictions',
    candidateStatus: 'candidate_for_further_testing',
    bankId: bank.id,
    hostId,
    budget,
    cocktailSize,
    ranked,
    shortlist,
    cocktail,
    comparison: {
      purpose: 'retrospective',
      shortlisted: shortlistedObservations,
      cocktail: summarizeObservations(cocktail),
      full: fullObservations,
      fullObservedPositives: fullObservations.positive,
      shortlistedObservedPositives: shortlistedObservations.positive,
      positiveRecall: fullObservations.positive === 0
        ? null
        : shortlistedObservations.positive / fullObservations.positive,
    },
    diversity: {
      knownClusters,
      knownClusterCount: knownClusters.length,
      unknownClusterCount: cocktail.filter((row) => !row.clusterKnown).length,
    },
    disclaimer: CANDIDATE_DISCLAIMER,
  };
}

/** Export a reproducible plan and its provenance, without efficacy claims. */
export function createExport(bank, hostId, plan, options = {}) {
  validateBank(bank);
  const host = findHost(bank, hostId);
  if (!plan || plan.bankId !== bank.id || plan.hostId !== hostId) {
    throw new TypeError('The plan must correspond to the selected bank and host.');
  }
  // Recalculate from saved data instead of trusting a mutable UI plan object.
  const verifiedPlan = planScreen(bank, hostId, plan.budget, plan.cocktailSize);
  const timestamp = options.timestamp ?? new Date().toISOString();
  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError('Export timestamp must be a valid date string.');
  }
  return {
    schemaVersion: 1,
    generatedAt: timestamp,
    status: 'saved_predictions',
    candidateStatus: 'candidate_for_further_testing',
    bank: { id: bank.id, name: bank.name || bank.id, species: bank.species || null },
    host: { id: host.id, name: host.name || host.id },
    method: {
      ranking: 'Finite saved scores descending; ties use ascending phage ID.',
      shortlist: 'Highest-ranked phages within the selected testing budget.',
      cocktail: 'Highest-ranked phage, then distinct known sequence clusters, then remaining ranks; drawn only from the shortlist.',
      observations: 'Retrospective comparison only; never used for ranking or selection.',
      scoreInterpretation: 'Model score for ranking; no probability or efficacy threshold is assumed.',
    },
    budget: verifiedPlan.budget,
    cocktailSize: verifiedPlan.cocktailSize,
    shortlist: verifiedPlan.shortlist,
    candidateCocktail: verifiedPlan.cocktail,
    retrospectiveComparison: verifiedPlan.comparison,
    sequenceDiversity: verifiedPlan.diversity,
    provenance: bank.provenance ?? null,
    sources: bank.sources ?? [],
    disclaimer: CANDIDATE_DISCLAIMER,
  };
}

/** Convenience wrapper for callers holding either a host record or its ID. */
export function formatPlan(bank, host, plan, options = {}) {
  const hostId = typeof host === 'string' ? host : host?.id;
  return createExport(bank, hostId, plan, options);
}
