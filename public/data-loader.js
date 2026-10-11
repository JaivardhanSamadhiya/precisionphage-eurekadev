import { validateBank } from './planner.js';

const SNAPSHOT_PATH = 'public/data/bank.json';

async function fetchBytes(url, fetchSnapshot) {
  const name = url.pathname.split('/').at(-1);
  let response;
  try {
    response = await fetchSnapshot(url, { credentials: 'omit' });
  } catch (cause) {
    throw new Error(`Could not load ${name}: the network request failed.`, { cause });
  }
  if (!response.ok) {
    throw new Error(`Could not load ${name} (HTTP ${response.status}).`);
  }
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    throw new Error(`Could not read the response for ${name}.`, { cause });
  }
}

function parseJSON(bytes, name) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new TypeError(`Malformed ${name}: the file is not valid UTF-8.`, { cause });
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new TypeError(`Malformed ${name}: the file is not valid JSON.`, { cause });
  }
}

function snapshotMetadata(provenance) {
  if (!provenance || provenance.schemaVersion !== 1 || !Array.isArray(provenance.sources)) {
    throw new TypeError(
      'Unsupported source manifest: expected schemaVersion 1 and a sources array.',
    );
  }
  if (!Array.isArray(provenance.generatedFiles)) {
    throw new TypeError('Source manifest is missing generatedFiles snapshot metadata.');
  }
  const matches = provenance.generatedFiles.filter((file) => file?.path === SNAPSHOT_PATH);
  if (matches.length !== 1) {
    throw new TypeError(`Source manifest must describe exactly one ${SNAPSHOT_PATH} artifact.`);
  }
  const metadata = matches[0];
  if (typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(metadata.sha256)) {
    throw new TypeError('Snapshot artifact metadata requires a 64-character SHA-256 hash.');
  }
  if (!Number.isSafeInteger(metadata.bytes) || metadata.bytes <= 0) {
    throw new TypeError('Snapshot artifact metadata requires a positive integer byte length.');
  }
  return metadata;
}

function validateSnapshot(dataset, provenance) {
  if (
    !dataset ||
    dataset.schemaVersion !== 1 ||
    !Array.isArray(dataset.banks) ||
    !dataset.banks.length
  ) {
    throw new TypeError(
      'Unsupported saved bank dataset: expected schemaVersion 1 and evaluated banks.',
    );
  }
  if (
    typeof dataset.datasetVersion !== 'string' ||
    !dataset.datasetVersion.trim() ||
    dataset.datasetVersion !== provenance.datasetVersion
  ) {
    throw new TypeError('Dataset version does not match the source manifest.');
  }

  const sourceIds = provenance.sources.map((source) => source?.id);
  if (
    sourceIds.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(sourceIds).size !== sourceIds.length
  ) {
    throw new TypeError('Source manifest IDs must be distinct nonempty strings.');
  }
  const availableSources = new Set(sourceIds);
  const bankIds = new Set();
  for (const bank of dataset.banks) {
    validateBank(bank);
    if (bankIds.has(bank.id)) throw new TypeError(`Duplicate bank ID: ${bank.id}.`);
    bankIds.add(bank.id);
    if (!bank.phages.length || !bank.hosts.length) {
      throw new TypeError(`Bank ${bank.id} must contain phages and evaluated hosts.`);
    }
    for (const host of bank.hosts) {
      if (!host.pairs.some((pair) => Number.isFinite(pair.score))) {
        throw new TypeError(`Host ${host.id} has no finite saved scores.`);
      }
    }
    if (
      !Array.isArray(bank.sourceIds) ||
      !bank.sourceIds.length ||
      bank.sourceIds.some((id) => typeof id !== 'string' || !id.trim()) ||
      new Set(bank.sourceIds).size !== bank.sourceIds.length
    ) {
      throw new TypeError(`Bank ${bank.id} must reference distinct nonempty source IDs.`);
    }
    for (const sourceId of bank.sourceIds) {
      if (!availableSources.has(sourceId)) {
        throw new TypeError(`Bank ${bank.id} references missing source ${sourceId}.`);
      }
    }
  }
}

/**
 * Load the shipped evidence and verify its bytes against the accompanying
 * manifest. This detects altered or mismatched snapshots; it does not certify
 * the scientific validity or authenticity of the manifest itself.
 */
export async function loadSnapshot(options = {}) {
  const {
    fetch: fetchSnapshot = globalThis.fetch,
    crypto: snapshotCrypto = globalThis.crypto,
    baseURL = new URL('./data/', import.meta.url),
  } = options;
  if (typeof fetchSnapshot !== 'function') {
    throw new TypeError('Snapshot loading requires a fetch implementation.');
  }
  if (typeof snapshotCrypto?.subtle?.digest !== 'function') {
    throw new Error(
      'SHA-256 verification is unavailable. Open the website over HTTPS or localhost.',
    );
  }

  const [bankBytes, manifestBytes] = await Promise.all([
    fetchBytes(new URL('bank.json', baseURL), fetchSnapshot),
    fetchBytes(new URL('provenance.json', baseURL), fetchSnapshot),
  ]);
  const provenance = parseJSON(manifestBytes, 'provenance.json');
  const metadata = snapshotMetadata(provenance);
  if (bankBytes.byteLength !== metadata.bytes) {
    throw new Error(
      `Snapshot byte length mismatch: expected ${metadata.bytes}, received ${bankBytes.byteLength}.`,
    );
  }
  let digest;
  try {
    digest = await snapshotCrypto.subtle.digest('SHA-256', bankBytes);
  } catch (cause) {
    throw new Error('Could not calculate the snapshot SHA-256 hash.', { cause });
  }
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (sha256 !== metadata.sha256.toLowerCase()) {
    throw new Error('Snapshot SHA-256 mismatch: bank.json differs from the source manifest.');
  }

  const dataset = parseJSON(bankBytes, 'bank.json');
  validateSnapshot(dataset, provenance);
  return {
    dataset,
    provenance,
    integrity: { algorithm: 'SHA-256', sha256, bytes: bankBytes.byteLength },
  };
}
