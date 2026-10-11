import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { loadSnapshot } from '../public/data-loader.js';

const bankBytes = await readFile(new URL('../public/data/bank.json', import.meta.url));
const manifestBytes = await readFile(new URL('../public/data/provenance.json', import.meta.url));
const dataset = JSON.parse(bankBytes);
const manifest = JSON.parse(manifestBytes);
const baseURL = new URL('https://example.github.io/PrecisionPhage/data/');
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixtureFetch(bytes = bankBytes, provenance = manifestBytes, requests = []) {
  return async (url, options) => {
    requests.push({ url: String(url), options });
    if (url.pathname.endsWith('/bank.json')) return new Response(bytes);
    if (url.pathname.endsWith('/provenance.json')) return new Response(provenance);
    return new Response(null, { status: 404 });
  };
}

function loadFixture(bytes = bankBytes, provenance = manifestBytes) {
  return loadSnapshot({ fetch: fixtureFetch(bytes, provenance), crypto: webcrypto, baseURL });
}

// Schema tests use a matching digest so the failure concerns the records, not
// the deliberate fixture edit. Ordinary edits retain the original manifest.
function changedSnapshot(changeDataset, changeManifest = () => {}) {
  const changedData = structuredClone(dataset);
  const changedManifest = structuredClone(manifest);
  changeDataset(changedData);
  const bytes = encode(changedData);
  const metadata = changedManifest.generatedFiles.find(
    (file) => file.path === 'public/data/bank.json',
  );
  metadata.bytes = bytes.byteLength;
  metadata.sha256 = sha256(bytes);
  changeManifest(changedManifest);
  return loadFixture(bytes, encode(changedManifest));
}

test('the shipped snapshot loads with its exact bytes, sources, and integrity digest', async () => {
  const result = await loadFixture();
  assert.deepEqual(result.dataset, dataset);
  assert.deepEqual(result.provenance, manifest);
  assert.deepEqual(result.integrity, {
    algorithm: 'SHA-256',
    sha256: sha256(bankBytes),
    bytes: bankBytes.byteLength,
  });
});

test('both requests start concurrently and preserve the GitHub Pages project subpath', async () => {
  const requests = [];
  const pending = [];
  const fetch = (url, options) =>
    new Promise((resolve) => {
      requests.push({ url: String(url), options });
      pending.push(() =>
        resolve(new Response(url.pathname.endsWith('/bank.json') ? bankBytes : manifestBytes)),
      );
    });
  const loading = loadSnapshot({ fetch, crypto: webcrypto, baseURL });
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      'https://example.github.io/PrecisionPhage/data/bank.json',
      'https://example.github.io/PrecisionPhage/data/provenance.json',
    ],
  );
  assert.ok(requests.every((request) => request.options.credentials === 'omit'));
  pending.forEach((resolve) => resolve());
  await loading;
});

test('one changed byte is rejected even when bank.json remains valid JSON', async () => {
  const altered = Buffer.from(bankBytes);
  const index = altered.indexOf('2026');
  assert.ok(index >= 0);
  altered[index + 3] ^= 1;
  assert.doesNotThrow(() => JSON.parse(altered));
  await assert.rejects(loadFixture(altered), /SHA-256 mismatch/);
});

test('truncated and appended snapshot bytes cannot match the declared size', async () => {
  await assert.rejects(
    loadFixture(bankBytes.subarray(0, bankBytes.length - 1)),
    /byte length mismatch/,
  );
  await assert.rejects(
    loadFixture(Buffer.concat([bankBytes, Buffer.from(' ')])),
    /byte length mismatch/,
  );
});

test('version mismatch and unsupported schemas fail before evidence is returned', async () => {
  await assert.rejects(
    changedSnapshot((data) => {
      data.datasetVersion = 'different-snapshot';
    }),
    /version.*match/i,
  );
  await assert.rejects(
    changedSnapshot((data) => {
      delete data.datasetVersion;
    }),
    /version.*match/i,
  );
  await assert.rejects(
    changedSnapshot((data) => {
      data.schemaVersion = 2;
    }),
    /Unsupported saved bank dataset/,
  );
  await assert.rejects(
    changedSnapshot(
      () => {},
      (provenance) => {
        provenance.schemaVersion = 2;
      },
    ),
    /Unsupported source manifest/,
  );
});

test('missing, duplicate, and incomplete artifact metadata fail clearly', async () => {
  const changes = [
    [
      (provenance) => {
        delete provenance.generatedFiles;
      },
      /missing generatedFiles/,
    ],
    [
      (provenance) => {
        provenance.generatedFiles = [];
      },
      /exactly one/,
    ],
    [
      (provenance) => {
        provenance.generatedFiles.push({ ...provenance.generatedFiles[0] });
      },
      /exactly one/,
    ],
    [
      (provenance) => {
        delete provenance.generatedFiles[0].sha256;
      },
      /SHA-256 hash/,
    ],
    [
      (provenance) => {
        provenance.generatedFiles[0].sha256 = 'invalid';
      },
      /SHA-256 hash/,
    ],
    [
      (provenance) => {
        delete provenance.generatedFiles[0].bytes;
      },
      /byte length/,
    ],
  ];
  for (const [change, message] of changes) {
    const provenance = structuredClone(manifest);
    change(provenance);
    await assert.rejects(loadFixture(bankBytes, encode(provenance)), message);
  }
});

test('unknown and ambiguous source references cannot masquerade as cited evidence', async () => {
  await assert.rejects(
    changedSnapshot((data) => {
      data.banks[0].sourceIds.push('invented-source');
    }),
    /references missing source invented-source/,
  );
  await assert.rejects(
    changedSnapshot((data) => {
      data.banks[0].sourceIds.push(data.banks[0].sourceIds[0]);
    }),
    /distinct nonempty source IDs/,
  );
  await assert.rejects(
    changedSnapshot(
      () => {},
      (provenance) => {
        provenance.sources.push({ ...provenance.sources[0] });
      },
    ),
    /manifest IDs must be distinct/,
  );
  await assert.rejects(
    changedSnapshot((data) => {
      delete data.banks[0].sourceIds;
    }),
    /distinct nonempty source IDs/,
  );
});

test('duplicate banks, hosts, phages, and pairs are rejected by snapshot validation', async () => {
  const cases = [
    [
      (data) => {
        data.banks.push(structuredClone(data.banks[0]));
      },
      /Duplicate bank ID/,
    ],
    [
      (data) => {
        data.banks[0].hosts.push(structuredClone(data.banks[0].hosts[0]));
      },
      /Duplicate host ID/,
    ],
    [
      (data) => {
        data.banks[0].phages.push(structuredClone(data.banks[0].phages[0]));
      },
      /Duplicate phage ID/,
    ],
    [
      (data) => {
        const host = data.banks[0].hosts[0];
        host.pairs.push({ ...host.pairs[0] });
      },
      /Duplicate pair/,
    ],
  ];
  for (const [change, message] of cases) await assert.rejects(changedSnapshot(change), message);
});

test('invalid observations and unknown phages cannot enter the workbench', async () => {
  await assert.rejects(
    changedSnapshot((data) => {
      data.banks[0].hosts[0].pairs[0].observed = 2;
    }),
    /Observation.*must be/,
  );
  await assert.rejects(
    changedSnapshot((data) => {
      data.banks[0].hosts[0].pairs[0].phageId = 'invented-phage';
    }),
    /unknown phage/,
  );
});

test('malformed JSON and invalid UTF-8 identify the affected file', async () => {
  await assert.rejects(loadFixture(bankBytes, Buffer.from('{')), /Malformed provenance.json.*JSON/);
  await assert.rejects(
    loadFixture(bankBytes, new Uint8Array([0xff])),
    /Malformed provenance.json.*UTF-8/,
  );
  for (const bytes of [Buffer.from('{'), new Uint8Array([0xff])]) {
    const provenance = structuredClone(manifest);
    provenance.generatedFiles[0].bytes = bytes.byteLength;
    provenance.generatedFiles[0].sha256 = sha256(bytes);
    await assert.rejects(loadFixture(bytes, encode(provenance)), /Malformed bank.json/);
  }
});

test('HTTP, network, and response-read failures retain useful file context', async () => {
  await assert.rejects(
    loadSnapshot({
      fetch: async () => new Response(null, { status: 503 }),
      crypto: webcrypto,
      baseURL,
    }),
    /bank.json \(HTTP 503\)/,
  );
  await assert.rejects(
    loadSnapshot({
      fetch: async () => {
        throw new Error('offline');
      },
      crypto: webcrypto,
      baseURL,
    }),
    /bank.json.*network request failed/,
  );
  const response = {
    ok: true,
    async arrayBuffer() {
      throw new Error('interrupted');
    },
  };
  await assert.rejects(
    loadSnapshot({ fetch: async () => response, crypto: webcrypto, baseURL }),
    /response for bank.json/,
  );
});

test('missing browser capabilities and hashing failures stop unverifiable loading', async () => {
  await assert.rejects(
    loadSnapshot({ fetch: null, crypto: webcrypto, baseURL }),
    /fetch implementation/,
  );
  await assert.rejects(
    loadSnapshot({ fetch: fixtureFetch(), crypto: {}, baseURL }),
    /SHA-256 verification is unavailable/,
  );
  const failingCrypto = {
    subtle: {
      async digest() {
        throw new Error('digest failure');
      },
    },
  };
  await assert.rejects(
    loadSnapshot({ fetch: fixtureFetch(), crypto: failingCrypto, baseURL }),
    /Could not calculate.*SHA-256/,
  );
});
