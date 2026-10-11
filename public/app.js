import { validateBank, planScreen } from './planner.js';
import { createSnapshotExport } from './export.js';

import { element as $, setOptions, downloadJSON } from './ui/dom.js';
import { renderPlan, renderTable, renderEvidence, renderSources } from './ui/workbench.js';

let dataset, provenance, bank, hostId, plan;
let showAll = false;
const query = new URLSearchParams(location.search);

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  return response.json();
}

function chooseBank(id, preferredHost) {
  bank = dataset.banks.find((item) => item.id === id) || dataset.banks[0];
  $('bank-select').value = bank.id;
  hostId = bank.hosts.some((host) => host.id === preferredHost) ? preferredHost : bank.hosts[0].id;
  setOptions($('host-select'), bank.hosts.map((host) => [host.id, host.id]), hostId);
  $('bank-description').textContent = bank.description;
  $('species-label').textContent = bank.species;
  showAll = false;
  update();
}

function update() {
  const host = bank.hosts.find((item) => item.id === hostId);
  const available = host.pairs.filter((pair) => Number.isFinite(pair.score)).length;
  const budget = Math.max(1, Math.min(available, Math.round(Number($('budget').value) || 10)));
  const size = Math.max(1, Math.min(6, budget, Number($('cocktail-size').value) || 3));
  $('budget').max = available;
  $('budget').value = budget;
  $('budget-max').textContent = `${available} phages`;
  $('budget-value').textContent = `${budget} assays`;
  $('pair-count').textContent = `${available} saved pairs`;
  setOptions($('cocktail-size'), Array.from({ length: Math.min(6, budget) }, (_, i) => [i + 1, `${i + 1} phage${i ? 's' : ''}`]), size);
  plan = planScreen(bank, hostId, budget, size);
  renderPlan(bank, hostId, plan, showAll);
  renderEvidence(bank, hostId, plan);
  const params = new URLSearchParams({ bank: bank.id, host: hostId, budget: String(budget), size: String(size) });
  history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
  $('update-status').textContent = `Updated ${hostId}: ${budget} phages shortlisted, ${size} candidates for further mixture testing.`;
}

$('bank-select').addEventListener('change', (event) => chooseBank(event.target.value));
$('host-select').addEventListener('change', (event) => { hostId = event.target.value; showAll = false; update(); });
$('budget').addEventListener('input', update);
$('cocktail-size').addEventListener('change', update);
$('show-all').addEventListener('click', () => { showAll = !showAll; renderTable(plan, showAll); });
$('download').addEventListener('click', () => {
  const exported = createSnapshotExport(dataset, provenance, bank.id, hostId, plan);
  downloadJSON(`precisionphage-${bank.id}-${hostId}-testing-plan.json`, exported);
});

try {
  [dataset, provenance] = await Promise.all([loadJSON('./data/bank.json'), loadJSON('./data/provenance.json')]);
  if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.banks) || !dataset.banks.length) throw new Error('The saved bank snapshot has an unsupported format.');
  dataset.banks.forEach(validateBank);
  setOptions($('bank-select'), dataset.banks.map((item) => [item.id, item.name]), query.get('bank'));
  const queryBudget = Number(query.get('budget'));
  if (Number.isInteger(queryBudget) && queryBudget >= 1) $('budget').value = Math.min(queryBudget, 52);
  const querySize = Number(query.get('size'));
  if (Number.isInteger(querySize) && querySize >= 1 && querySize <= 6) setOptions($('cocktail-size'), [[querySize, `${querySize} phages`]], querySize);
  chooseBank(query.get('bank'), query.get('host'));
  renderSources(provenance);
  $('loading').hidden = true;
  $('workspace').hidden = false;
} catch (error) {
  $('loading').hidden = true;
  $('error').hidden = false;
  $('error').textContent = `${error.message} Run npm start and open the printed local URL; local file URLs cannot load this data. The workbench needs its saved snapshots to operate.`;
}
