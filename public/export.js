import { createExport } from './planner.js';

/**
 * Create a portable testing-plan artifact containing the consumed saved-data
 * snapshot, research limitations, source hashes, and original attribution.
 * Candidate selection is recomputed by the planner from the saved bank.
 */
export function createSnapshotExport(dataset, manifest, bankId, hostId, plan, options = {}) {
  if (!dataset || dataset.schemaVersion !== 1 || !Array.isArray(dataset.banks)) {
    throw new TypeError('A supported saved bank dataset is required.');
  }
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources)) {
    throw new TypeError('A supported source manifest is required.');
  }
  if (typeof dataset.datasetVersion !== 'string' || dataset.datasetVersion.length === 0 ||
      dataset.datasetVersion !== manifest.datasetVersion) {
    throw new TypeError('Dataset version does not match the source manifest.');
  }
  const matchingBanks = dataset.banks.filter((bank) => bank?.id === bankId);
  if (matchingBanks.length === 0) throw new RangeError(`Unknown bank: ${bankId}.`);
  if (matchingBanks.length !== 1) throw new TypeError(`Ambiguous bank ID: ${bankId}.`);
  const bank = matchingBanks[0];
  if (!Array.isArray(bank.sourceIds) || bank.sourceIds.length === 0 ||
      bank.sourceIds.some((id) => typeof id !== 'string' || id.length === 0) ||
      new Set(bank.sourceIds).size !== bank.sourceIds.length) {
    throw new TypeError(`Bank ${bank.id} must reference distinct source IDs.`);
  }
  const sourceIds = manifest.sources.map((source) => source?.id);
  if (sourceIds.some((id) => typeof id !== 'string' || id.length === 0) ||
      new Set(sourceIds).size !== sourceIds.length) {
    throw new TypeError('Source manifest IDs must be distinct nonempty strings.');
  }
  const availableIds = new Set(sourceIds);
  for (const sourceId of bank.sourceIds) {
    if (!availableIds.has(sourceId)) {
      throw new TypeError(`Bank ${bank.id} references missing source ${sourceId}.`);
    }
  }
  const exported = createExport(bank, hostId, plan, options);
  return {
    ...exported,
    datasetVersion: dataset.datasetVersion,
    scoreMeaning: bank.scoreMeaning,
    observationMeaning: bank.observationMeaning,
    model: bank.model,
    evaluationMode: bank.evaluationMode,
    limitations: structuredClone(bank.limitations),
    sourceIds: [...bank.sourceIds],
    sources: structuredClone(manifest.sources.filter((source) => bank.sourceIds.includes(source.id))),
    provenance: { ...structuredClone(manifest), sourceManifest: './data/provenance.json' },
  };
}
