import { validateBank, planScreen } from './planner.js';
import { createSnapshotExport } from './export.js';

const $ = (id) => document.getElementById(id);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fixed = (value) => Number.isFinite(value) ? value.toFixed(3) : 'Unavailable';
const scoreText = (value) => value.toFixed(6);
const assay = (value) => value === 1 ? ['positive', 'Positive'] : value === 0 ? ['negative', 'Negative'] : ['unknown', 'Unavailable'];
let dataset, provenance, bank, hostId, plan;
let showAll = false;
const query = new URLSearchParams(location.search);

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  return response.json();
}

function setOptions(select, items, selected) {
  select.replaceChildren(...items.map(([value, label]) => {
    const option = new Option(label, value);
    option.selected = String(value) === String(selected);
    return option;
  }));
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
  renderPlan();
  renderEvidence();
  const params = new URLSearchParams({ bank: bank.id, host: hostId, budget: String(budget), size: String(size) });
  history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
  $('update-status').textContent = `Updated ${hostId}: ${budget} phages shortlisted, ${size} candidates for further mixture testing.`;
}

function renderPlan() {
  const comparison = plan.comparison;
  $('stat-bank').textContent = plan.ranked.length;
  const missing = bank.phages.length - plan.ranked.length;
  $('stat-missing').textContent = missing ? `${missing} bank phages have no saved pair` : 'full bank has saved scores';
  $('stat-shortlist').textContent = plan.shortlist.length;
  $('stat-positive').textContent = `${comparison.shortlisted.positive} / ${comparison.shortlisted.assayed}`;
  $('stat-observations').textContent = 'among recorded individual assays';
  $('ranking-host').textContent = `for ${hostId}`;
  $('ranking-caveat').textContent = bank.id === 'basel-ecor'
    ? 'Model failure case: bank AUROC 0.470 with severe overprediction. High saved scores did not reliably predict recorded activity.'
    : 'Bank-specific saved host-identity evaluation. Scores are uncalibrated and performance depends on how related hosts are grouped.';
  renderTable();
  $('cocktail-members').innerHTML = plan.cocktail.map((row) => `<div class="member"><strong>${escape(row.phageId)}</strong><span title="${escape(row.score)}">Saved score ${scoreText(row.score)}</span><span>${row.clusterKnown ? `Sequence cluster ${escape(row.cluster)}` : 'Sequence cluster unavailable'}</span><span>Recorded assay: ${assay(row.observed)[1].toLowerCase()}</span></div>`).join('');
  const count = plan.diversity.knownClusterCount;
  $('cocktail-rationale').textContent = `Selected ${plan.cocktail.length} phages from the top ${plan.budget} saved ranks. ${count ? `${count} distinct recorded sequence cluster${count === 1 ? '' : 's'} represented.` : 'No phage sequence cluster metadata is available; selection follows score order.'} This heuristic does not estimate combined efficacy.`;
}

function renderTable() {
  const members = new Set(plan.cocktail.map((row) => row.phageId));
  const visible = showAll ? plan.ranked : plan.ranked.slice(0, Math.max(10, Math.min(20, plan.budget)));
  $('rankings').innerHTML = visible.map((row) => {
    const [status, label] = assay(row.observed);
    const inBudget = row.rank <= plan.budget;
    const inCocktail = members.has(row.phageId);
    return `<tr class="${inBudget ? 'shortlisted' : ''}"><td class="rank-number">${String(row.rank).padStart(2, '0')}</td><td><span class="phage-name" title="${escape(row.name)}">${escape(row.phageId)}</span><span class="phage-subtitle">${row.clusterKnown ? `Cluster ${escape(row.cluster)}` : 'Cluster unavailable'}</span></td><td class="score-cell"><span class="score-numeric" title="Full saved score: ${escape(row.score)}">${scoreText(row.score)}</span><span class="score-track" aria-hidden="true"><i style="width:${Math.max(0, Math.min(1, row.score)) * 100}%"></i></span></td><td><span class="assay-badge ${status}">${label}</span></td><td>${inCocktail ? '<span class="plan-chip mixture">Mixture candidate</span>' : inBudget ? '<span class="plan-chip">To screen</span>' : '<span class="rank-number">—</span>'}</td></tr>`;
  }).join('');
  $('table-count').textContent = `${visible.length} of ${plan.ranked.length} scored phage–host pairs`;
  $('show-all').hidden = plan.ranked.length <= 10;
  $('show-all').textContent = showAll ? 'Show fewer rows' : 'Show full ranking';
  $('show-all').setAttribute('aria-expanded', String(showAll));
}

function renderEvidence() {
  const { full, shortlisted, positiveRecall } = plan.comparison;
  const recall = positiveRecall == null ? 'No recorded positives are available for a recall comparison.' : `The shortlist captures ${(positiveRecall * 100).toFixed(0)}% of ${full.positive} recorded positives among recorded pairs.`;
  $('comparison-text').textContent = `For ${hostId}, ${shortlisted.positive} of ${shortlisted.assayed} recorded assays in the top ${plan.budget} ranks were positive; ${shortlisted.negative} were negative${shortlisted.unknown ? ` and ${shortlisted.unknown} were unavailable` : ''}. ${recall} This is a retrospective comparison using existing data.`;
  $('observation-chart').innerHTML = plan.ranked.map((row) => {
    const [status, label] = assay(row.observed);
    const description = `Rank ${row.rank}: ${row.phageId}, ${label.toLowerCase()} recorded assay${row.rank <= plan.budget ? ', shortlisted' : ''}`;
    return `<span class="assay-tile ${status} ${row.rank <= plan.budget ? 'selected' : ''}" role="img" aria-label="${escape(description)}" title="${escape(description)}"></span>`;
  }).join('');
  $('model-heading').textContent = bank.name;
  const metrics = bank.metrics || {};
  $('model-metrics').innerHTML = `<div><strong>${fixed(metrics.auroc)}</strong><span>Bank AUROC</span></div>${Number.isFinite(metrics.ece) ? `<div><strong>${fixed(metrics.ece)}</strong><span>Calibration error (ECE)</span></div>` : '<div><strong>Uncalibrated</strong><span>Use scores for ranking only</span></div>'}`;
  $('performance-summary').textContent = bank.id === 'basel-ecor' ? 'This frozen transfer evaluation failed to discriminate activity (AUROC 0.470) and severely overpredicted it. High scores do not imply reliable activity.' : 'This bank-specific retrospective evaluation holds out host identities and depends on grouping assumptions. It does not establish performance on prospectively collected or independently sourced hosts, or clinical efficacy.';
  $('limitations').innerHTML = bank.limitations.map((item) => `<li>${escape(item)}</li>`).join('');
}

function renderSources() {
  const citations = provenance.sources || [];
  $('sources-content').innerHTML = `<p>Research artifacts predate this website. Source snapshots were read from a separate research project and extracted into compact data. Predictions and observations are joined by exact host–phage identifiers; missing scores are not invented.</p><ul>${citations.map((citation) => {
    const title = citation.title || citation.label || citation.name || citation.id;
    const url = citation.url || (citation.doi ? `https://doi.org/${citation.doi}` : '');
    return `<li>${/^https:\/\//.test(url) ? `<a href="${escape(url)}" target="_blank" rel="noopener">${escape(title)}</a>` : escape(title)}${citation.authors ? ` — ${escape(citation.authors)}` : ''}${citation.terms ? `<br>${escape(citation.terms)}` : ''}</li>`;
  }).join('')}</ul><p>Saved scores and research models: <a href="https://github.com/JaivardhanSamadhiya/precisionphage" target="_blank" rel="noopener">PrecisionPhage research project, Jaivardhan Samadhiya</a>. The models, experiments, and saved results predate this website.</p><p>All sources, upstream attribution, extraction checks, and source hashes are preserved in the manifest below. A source hash records the snapshot consumed; it does not independently certify historical blinding. <a href="./data/notices.json" target="_blank" rel="noopener">Read original attribution and license notices</a>.</p>`;
}

$('bank-select').addEventListener('change', (event) => chooseBank(event.target.value));
$('host-select').addEventListener('change', (event) => { hostId = event.target.value; showAll = false; update(); });
$('budget').addEventListener('input', update);
$('cocktail-size').addEventListener('change', update);
$('show-all').addEventListener('click', () => { showAll = !showAll; renderTable(); });
$('download').addEventListener('click', () => {
  const exported = createSnapshotExport(dataset, provenance, bank.id, hostId, plan);
  const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `precisionphage-${bank.id}-${hostId}-testing-plan.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  renderSources();
  $('loading').hidden = true;
  $('workspace').hidden = false;
} catch (error) {
  $('loading').hidden = true;
  $('error').hidden = false;
  $('error').textContent = `${error.message} Run npm start and open the printed local URL; local file URLs cannot load this data. The workbench needs its saved snapshots to operate.`;
}
