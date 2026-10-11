import { planScreen } from "./planner.js";
import { createSnapshotExport } from "./export.js";
import { loadSnapshot } from "./data-loader.js";
import {
  buildBudgetFrontier,
  summarizeBankBudgets,
  planHostPortfolio,
} from "./analysis.js";

import { element as $, setOptions, downloadJSON } from "./ui/dom.js";
import {
  renderPlan,
  renderTable,
  renderEvidence,
  renderSources,
} from "./ui/workbench.js";
import { renderFrontier, renderPortfolio } from "./ui/insights.js";

let dataset, provenance, bank, hostId, plan, frontier, bankAudit, panel;
let panelHostIds = [];
let showAll = false;
const query = new URLSearchParams(location.search);

function chooseBank(id, preferredHost, preferredPanel = []) {
  bank = dataset.banks.find((item) => item.id === id) || dataset.banks[0];
  $("bank-select").value = bank.id;
  hostId = bank.hosts.some((host) => host.id === preferredHost)
    ? preferredHost
    : bank.hosts[0].id;
  setOptions(
    $("host-select"),
    bank.hosts.map((host) => [host.id, host.id]),
    hostId,
  );
  $("bank-description").textContent = bank.description;
  $("species-label").textContent = bank.species;
  showAll = false;
  const validPanel = [...new Set(preferredPanel)]
    .filter((id) => bank.hosts.some((host) => host.id === id))
    .slice(0, 6);
  const following = bank.hosts
    .filter((host) => host.id !== hostId)
    .slice(0, 2)
    .map((host) => host.id);
  panelHostIds = validPanel.length ? validPanel : [hostId, ...following];
  $("portfolio-hosts").replaceChildren(
    ...bank.hosts.map((host) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = host.id;
      input.checked = panelHostIds.includes(host.id);
      label.append(input, document.createTextNode(host.id));
      return label;
    }),
  );
  update();
  updatePanel();
}

function update() {
  const host = bank.hosts.find((item) => item.id === hostId);
  const available = host.pairs.filter((pair) =>
    Number.isFinite(pair.score),
  ).length;
  const budget = Math.max(
    1,
    Math.min(available, Math.round(Number($("budget").value) || 10)),
  );
  const size = Math.max(
    1,
    Math.min(6, budget, Number($("cocktail-size").value) || 3),
  );
  $("budget").max = available;
  $("budget").value = budget;
  $("budget-max").textContent = `${available} phages`;
  $("budget-value").textContent = `${budget} assays`;
  $("pair-count").textContent = `${available} saved pairs`;
  setOptions(
    $("cocktail-size"),
    Array.from({ length: Math.min(6, budget) }, (_, i) => [
      i + 1,
      `${i + 1} phage${i ? "s" : ""}`,
    ]),
    size,
  );
  plan = planScreen(bank, hostId, budget, size);
  renderPlan(bank, hostId, plan, showAll);
  renderEvidence(bank, hostId, plan);
  frontier = buildBudgetFrontier(bank, hostId);
  bankAudit = summarizeBankBudgets(bank, budget);
  renderFrontier(frontier, budget, bankAudit);
  writeURL();
  $("update-status").textContent =
    `Updated ${hostId}: ${budget} phages shortlisted, ${size} candidates for further mixture testing.`;
}

function writeURL() {
  const params = new URLSearchParams({
    bank: bank.id,
    host: hostId,
    budget: String(plan.budget),
    size: String(plan.cocktailSize),
  });
  if (panelHostIds.length) {
    params.set("hosts", panelHostIds.join(","));
    params.set("panel", $("portfolio-size").value);
  }
  history.replaceState(
    null,
    "",
    `${location.pathname}?${params}${location.hash}`,
  );
}

function updatePanel() {
  panelHostIds = [
    ...$("portfolio-hosts").querySelectorAll("input:checked"),
  ].map((input) => input.value);
  $("portfolio-hosts")
    .querySelectorAll("input")
    .forEach((input) => {
      input.disabled = panelHostIds.length >= 6 && !input.checked;
    });
  const valid = panelHostIds.length > 0;
  $("portfolio-error").hidden = valid;
  $("portfolio-error").textContent = valid
    ? ""
    : "Choose at least one host for the shared panel.";
  $("download-panel").disabled = !valid;
  $("portfolio-lab")
    .querySelector(".portfolio-results")
    .classList.toggle("unavailable-panel", !valid);
  if (valid) {
    panel = planHostPortfolio(
      bank,
      panelHostIds,
      Number($("portfolio-size").value),
    );
    renderPortfolio(bank, panel);
  } else {
    panel = null;
  }
  writeURL();
}

$("bank-select").addEventListener("change", (event) =>
  chooseBank(event.target.value),
);
$("host-select").addEventListener("change", (event) => {
  hostId = event.target.value;
  showAll = false;
  update();
});
$("budget").addEventListener("input", update);
$("cocktail-size").addEventListener("change", update);
$("show-all").addEventListener("click", () => {
  showAll = !showAll;
  renderTable(plan, showAll);
});
$("portfolio-hosts").addEventListener("change", updatePanel);
$("portfolio-size").addEventListener("change", updatePanel);
$("load-panel-example").addEventListener("click", () => {
  $("portfolio-size").value = "2";
  chooseBank("pseudomonas", "GCA_000006765", [
    "GCA_030068835",
    "GCA_030068895",
    "GCA_030069025",
  ]);
  $("portfolio-lab").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("download").addEventListener("click", () => {
  const exported = createSnapshotExport(
    dataset,
    provenance,
    bank.id,
    hostId,
    plan,
  );
  downloadJSON(
    `precisionphage-${bank.id}-${hostId}-testing-plan.json`,
    exported,
  );
});
$("download-audit").addEventListener("click", () => {
  downloadJSON(`precisionphage-${bank.id}-${hostId}-budget-audit.json`, {
    schemaVersion: 1,
    datasetVersion: dataset.datasetVersion,
    generatedAt: new Date().toISOString(),
    frontier,
    bankAudit,
    provenance,
    disclaimer:
      "Retrospective recorded assay comparison. Random is an expectation; the oracle uses hindsight labels. Neither is a prospective result or treatment outcome.",
  });
});
$("download-panel").addEventListener("click", () => {
  if (!panel) return;
  downloadJSON(`precisionphage-${bank.id}-shared-panel.json`, {
    schemaVersion: 1,
    datasetVersion: dataset.datasetVersion,
    generatedAt: new Date().toISOString(),
    panel,
    bankName: bank.name,
    limitations: bank.limitations,
    provenance,
    disclaimer:
      "A candidate shared screening panel based on saved rank representation. No biological coverage, mixture efficacy, or clinical validation is established.",
  });
});

try {
  const loaded = await loadSnapshot();
  ({ dataset, provenance } = loaded);
  $("snapshot-status").textContent = "Saved snapshot · SHA-256 verified";
  $("snapshot-status").title =
    `Compact data bytes match the committed manifest: ${loaded.integrity.sha256}. This does not certify scientific validity.`;
  setOptions(
    $("bank-select"),
    dataset.banks.map((item) => [item.id, item.name]),
    query.get("bank"),
  );
  const queryBudget = Number(query.get("budget"));
  if (Number.isInteger(queryBudget) && queryBudget >= 1)
    $("budget").value = Math.min(queryBudget, 52);
  const querySize = Number(query.get("size"));
  if (Number.isInteger(querySize) && querySize >= 1 && querySize <= 6)
    setOptions(
      $("cocktail-size"),
      [[querySize, `${querySize} phages`]],
      querySize,
    );
  const queryPanelSize = Number(query.get("panel"));
  if (
    Number.isInteger(queryPanelSize) &&
    queryPanelSize >= 1 &&
    queryPanelSize <= 6
  )
    $("portfolio-size").value = queryPanelSize;
  chooseBank(
    query.get("bank"),
    query.get("host"),
    (query.get("hosts") || "").split(",").filter(Boolean),
  );
  renderSources(provenance);
  $("loading").hidden = true;
  $("workspace").hidden = false;
  $("budget-lab").hidden = false;
  $("portfolio-lab").hidden = false;
} catch (error) {
  $("loading").hidden = true;
  $("error").hidden = false;
  $("error").textContent =
    `${error.message} Run npm start and open the printed local URL; local file URLs cannot load this data. The workbench needs its saved snapshots to operate.`;
}
