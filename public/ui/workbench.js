import {
  element as $,
  escapeHTML as escape,
  formatMetric as fixed,
  formatScore as scoreText,
  assayLabel as assay,
} from "./dom.js";

export function renderPlan(bank, hostId, plan, showAll) {
  const comparison = plan.comparison;
  $("stat-bank").textContent = plan.ranked.length;
  const missing = bank.phages.length - plan.ranked.length;
  $("stat-missing").textContent = missing
    ? `${missing} bank phages have no saved pair`
    : "full bank has saved scores";
  $("stat-shortlist").textContent = plan.shortlist.length;
  $("stat-positive").textContent =
    `${comparison.shortlisted.positive} / ${comparison.shortlisted.assayed}`;
  $("stat-observations").textContent = "among recorded individual assays";
  $("ranking-host").textContent = `for ${hostId}`;
  $("ranking-caveat").textContent =
    bank.id === "basel-ecor"
      ? "Model failure case: bank AUROC 0.470 with severe overprediction. High saved scores did not reliably predict recorded activity."
      : "Bank-specific saved host-identity evaluation. Scores are uncalibrated and performance depends on how related hosts are grouped.";
  renderTable(plan, showAll);
  $("cocktail-members").innerHTML = plan.cocktail
    .map(
      (row) =>
        `<div class="member"><strong>${escape(row.phageId)}</strong><span title="${escape(row.score)}">Saved score ${scoreText(row.score)}</span><span>${row.clusterKnown ? `Sequence cluster ${escape(row.cluster)}` : "Sequence cluster unavailable"}</span><span>Recorded assay: ${assay(row.observed)[1].toLowerCase()}</span></div>`,
    )
    .join("");
  const count = plan.diversity.knownClusterCount;
  $("cocktail-rationale").textContent =
    `Selected ${plan.cocktail.length} phages from the top ${plan.budget} saved ranks. ${count ? `${count} distinct recorded sequence cluster${count === 1 ? "" : "s"} represented.` : "No phage sequence cluster metadata is available; selection follows score order."} This heuristic does not estimate combined efficacy.`;
}

export function renderTable(plan, showAll) {
  const members = new Set(plan.cocktail.map((row) => row.phageId));
  const visible = showAll
    ? plan.ranked
    : plan.ranked.slice(0, Math.max(10, Math.min(20, plan.budget)));
  $("rankings").innerHTML = visible
    .map((row) => {
      const [status, label] = assay(row.observed);
      const inBudget = row.rank <= plan.budget;
      const inCocktail = members.has(row.phageId);
      return `<tr class="${inBudget ? "shortlisted" : ""}"><td class="rank-number">${String(row.rank).padStart(2, "0")}</td><td><span class="phage-name" title="${escape(row.name)}">${escape(row.phageId)}</span><span class="phage-subtitle">${row.clusterKnown ? `Cluster ${escape(row.cluster)}` : "Cluster unavailable"}</span></td><td class="score-cell"><span class="score-numeric" title="Full saved score: ${escape(row.score)}">${scoreText(row.score)}</span><span class="score-track" aria-hidden="true"><i style="width:${Math.max(0, Math.min(1, row.score)) * 100}%"></i></span></td><td><span class="assay-badge ${status}">${label}</span></td><td>${inCocktail ? '<span class="plan-chip mixture">Mixture candidate</span>' : inBudget ? '<span class="plan-chip">To screen</span>' : '<span class="rank-number">—</span>'}</td></tr>`;
    })
    .join("");
  $("table-count").textContent =
    `${visible.length} of ${plan.ranked.length} scored phage–host pairs`;
  $("show-all").hidden = plan.ranked.length <= 10;
  $("show-all").textContent = showAll ? "Show fewer rows" : "Show full ranking";
  $("show-all").setAttribute("aria-expanded", String(showAll));
}

export function renderEvidence(bank, hostId, plan) {
  const { full, shortlisted, positiveRecall } = plan.comparison;
  const recall =
    positiveRecall == null
      ? "No recorded positives are available for a recall comparison."
      : `The shortlist captures ${(positiveRecall * 100).toFixed(0)}% of ${full.positive} recorded positives among recorded pairs.`;
  $("comparison-text").textContent =
    `For ${hostId}, ${shortlisted.positive} of ${shortlisted.assayed} recorded assays in the top ${plan.budget} ranks were positive; ${shortlisted.negative} were negative${shortlisted.unknown ? ` and ${shortlisted.unknown} were unavailable` : ""}. ${recall} This is a retrospective comparison using existing data.`;
  $("observation-chart").innerHTML = plan.ranked
    .map((row) => {
      const [status, label] = assay(row.observed);
      const description = `Rank ${row.rank}: ${row.phageId}, ${label.toLowerCase()} recorded assay${row.rank <= plan.budget ? ", shortlisted" : ""}`;
      return `<span class="assay-tile ${status} ${row.rank <= plan.budget ? "selected" : ""}" role="img" aria-label="${escape(description)}" title="${escape(description)}"></span>`;
    })
    .join("");
  $("model-heading").textContent = bank.name;
  const metrics = bank.metrics || {};
  $("model-metrics").innerHTML =
    `<div><strong>${fixed(metrics.auroc)}</strong><span>Bank AUROC</span></div>${Number.isFinite(metrics.ece) ? `<div><strong>${fixed(metrics.ece)}</strong><span>Calibration error (ECE)</span></div>` : "<div><strong>Uncalibrated</strong><span>Use scores for ranking only</span></div>"}`;
  $("performance-summary").textContent =
    bank.id === "basel-ecor"
      ? "This frozen transfer evaluation failed to discriminate activity (AUROC 0.470) and severely overpredicted it. High scores do not imply reliable activity."
      : "This bank-specific retrospective evaluation holds out host identities and depends on grouping assumptions. It does not establish performance on prospectively collected or independently sourced hosts, or clinical efficacy.";
  $("limitations").innerHTML = bank.limitations
    .map((item) => `<li>${escape(item)}</li>`)
    .join("");
}

export function renderSources(provenance) {
  const citations = provenance.sources || [];
  $("sources-content").innerHTML =
    `<p>Research artifacts predate this website. Source snapshots were read from a separate research project and extracted into compact data. Predictions and observations are joined by exact host–phage identifiers; missing scores are not invented.</p><ul>${citations
      .map((citation) => {
        const title =
          citation.title || citation.label || citation.name || citation.id;
        const url =
          citation.url ||
          (citation.doi ? `https://doi.org/${citation.doi}` : "");
        return `<li>${/^https:\/\//.test(url) ? `<a href="${escape(url)}" target="_blank" rel="noopener">${escape(title)}</a>` : escape(title)}${citation.authors ? ` — ${escape(citation.authors)}` : ""}${citation.terms ? `<br>${escape(citation.terms)}` : ""}</li>`;
      })
      .join(
        "",
      )}</ul><p>Saved scores and research models: <a href="https://github.com/JaivardhanSamadhiya/precisionphage" target="_blank" rel="noopener">PrecisionPhage research project, Jaivardhan Samadhiya</a>. The models, experiments, and saved results predate this website.</p><p>All sources, upstream attribution, extraction checks, and source hashes are preserved in the manifest below. A source hash records the snapshot consumed; it does not independently certify historical blinding. <a href="./data/notices.json" target="_blank" rel="noopener">Read original attribution and license notices</a>.</p>`;
}
