import { rankPhages } from "../planner.js";
import { element as $, escapeHTML as escape, assayLabel } from "./dom.js";

const percent = (value) =>
  value == null ? "Unavailable" : `${(value * 100).toFixed(0)}%`;

export function renderFrontier(frontier, requestedBudget, bankAudit) {
  const { cohort, points, screeningBurden } = frontier;
  $("frontier-title").textContent = `Budget audit for ${frontier.hostId}`;
  if (!points.length) {
    $("frontier-chart").textContent =
      "No scored pairs with recorded assays are available for comparison.";
    $("frontier-summary").replaceChildren();
    $("frontier-table").replaceChildren();
    return;
  }
  const budget = Math.min(requestedBudget, cohort.evaluated);
  const selected = points[budget - 1];
  const plot = { left: 48, right: 644, top: 20, bottom: 222 };
  const yMax = Math.max(1, cohort.positives);
  const x = (value) =>
    plot.left + (value / cohort.evaluated) * (plot.right - plot.left);
  const y = (value) => plot.bottom - (value / yMax) * (plot.bottom - plot.top);
  const ticks = [
    ...new Set([
      0,
      Math.round(cohort.evaluated / 4),
      Math.round(cohort.evaluated / 2),
      Math.round((cohort.evaluated * 3) / 4),
      cohort.evaluated,
    ]),
  ];
  const path = (field, step = false) => {
    let previous = 0;
    return (
      `M ${x(0)} ${y(0)} ` +
      points
        .map((point) => {
          const segment = `${step ? `L ${x(point.budget)} ${y(previous)} ` : ""}L ${x(point.budget)} ${y(point[field])}`;
          previous = point[field];
          return segment;
        })
        .join(" ")
    );
  };
  $("frontier-chart").innerHTML = `
    <svg viewBox="0 0 680 270" role="img" aria-labelledby="frontier-svg-title frontier-svg-description">
      <title id="frontier-svg-title">Recorded positive assays found as the budget increases for ${escape(frontier.hostId)}</title>
      <desc id="frontier-svg-description">At budget ${budget}, saved rank order found ${selected.hits} recorded positives. Random screening would find ${selected.randomExpectedHits.toFixed(2)} on average. The hindsight maximum is ${selected.oracleHits}.</desc>
      ${[0, 0.5, 1].map((fraction) => `<line class="chart-grid" x1="${plot.left}" x2="${plot.right}" y1="${y(yMax * fraction)}" y2="${y(yMax * fraction)}"/><text class="chart-label" x="36" y="${y(yMax * fraction) + 4}" text-anchor="end">${(yMax * fraction).toFixed(fraction === 0.5 ? 1 : 0)}</text>`).join("")}
      ${ticks.map((tick) => `<text class="chart-label" x="${x(tick)}" y="241" text-anchor="middle">${tick}</text>`).join("")}
      <text class="chart-label" x="346" y="264" text-anchor="middle">Individual assays prioritized (fully observed scored subset)</text>
      <path class="frontier-line oracle" d="${path("oracleHits", true)}"/>
      <path class="frontier-line random" d="${path("randomExpectedHits")}"/>
      <path class="frontier-line saved" d="${path("hits", true)}"/>
      <line class="budget-cursor" x1="${x(budget)}" x2="${x(budget)}" y1="${plot.top}" y2="${plot.bottom}"/>
      <circle class="budget-point" cx="${x(budget)}" cy="${y(selected.hits)}" r="5"/>
    </svg>`;
  $("frontier-summary").innerHTML = `
    <div><strong>${selected.hits}</strong><span>recorded positives at budget ${budget}</span></div>
    <div><strong>${selected.randomExpectedHits.toFixed(2)}</strong><span>random expectation · same cohort</span></div>
    <div><strong>${percent(selected.recall)}</strong><span>recorded positive recall</span></div>
    <div><strong>${screeningBurden.firstHitBudget ?? "None"}</strong><span>saved rank of first recorded positive</span></div>`;
  const summary = bankAudit.summary;
  $("bank-audit-summary").textContent =
    `Across ${summary.hostCount} hosts in ${frontier.bankId}, this budget finds no positive for ${summary.zeroHitHosts} of ${summary.hostsWithRecordedPositives} hosts that have recorded positives. Total recorded hits: ${summary.hits}; random expected hits: ${summary.randomExpectedHits.toFixed(2)}. Budgets are capped at each host’s available measured pairs.`;
  $("frontier-cohort").textContent =
    `${cohort.evaluated} scored, measured pairs; ${cohort.positives} recorded positives. ${cohort.excludedUnknownAssay} scored pairs without assays and ${cohort.excludedWithoutScore} recorded pairs without scores are excluded. Random values are finite-population expectations, not prospective results; the oracle uses hindsight labels.`;
  $("frontier-table").innerHTML = points
    .map(
      (point) =>
        `<tr class="${point.budget === budget ? "shortlisted" : ""}"><td>${point.budget}</td><td>${point.hits}</td><td>${point.randomExpectedHits.toFixed(2)}</td><td>${point.oracleHits}</td><td>${percent(point.recall)}</td></tr>`,
    )
    .join("");
}

export function renderPortfolio(bank, panel) {
  const { optimization, baseline, rankRepresentation } = panel;
  $("portfolio-metrics").innerHTML = `
    <div><strong>${panel.utility.toFixed(3)}</strong><span>mean best reciprocal rank</span></div>
    <div><strong>${baseline.utility.toFixed(3)}</strong><span>independent ranking baseline</span></div>
    <div><strong>${rankRepresentation.representedHosts} / ${rankRepresentation.totalHosts}</strong><span>hosts with a top-${rankRepresentation.topRanks} member</span></div>`;
  $("portfolio-members").innerHTML = panel.removalLosses
    .map(
      (member) =>
        `<span class="panel-member"><strong>${escape(member.phageId)}</strong><small>Rank utility loss if removed: ${member.utilityLoss.toFixed(3)}</small></span>`,
    )
    .join("");
  const ranks = new Map(
    panel.hostIds.map((id) => [
      id,
      new Map(rankPhages(bank, id).map((row) => [row.phageId, row])),
    ]),
  );
  $("portfolio-matrix-head").innerHTML =
    `<tr><th scope="col">Host</th>${panel.phageIds.map((id) => `<th scope="col">${escape(id)}</th>`).join("")}<th scope="col">Best rank</th></tr>`;
  $("portfolio-matrix").innerHTML = panel.hostSummaries
    .map(
      (host) =>
        `<tr><th scope="row">${escape(host.hostId)}</th>${panel.phageIds
          .map((id) => {
            const row = ranks.get(host.hostId).get(id);
            const [status, label] = assayLabel(row?.observed);
            return `<td><strong class="matrix-rank">${row ? `Rank ${row.rank}` : "No score"}</strong><span class="assay-badge ${status}">${label} assay</span></td>`;
          })
          .join("")}<td>${host.bestRank ?? "Unavailable"}</td></tr>`,
    )
    .join("");
  $("portfolio-method").textContent =
    optimization.method === "exact"
      ? `Exact search evaluated ${optimization.combinations.toLocaleString()} eligible panels. The objective is optimal within this saved-rank search; greedy utility was ${optimization.greedyUtility.toFixed(3)}. Optimality concerns the rank objective only. Baseline selects phages independently by mean reciprocal rank.`
      : `Deterministic greedy search selected each member by its marginal rank contribution. The exact search would exceed 50,000 panels, so no optimality claim is made. Baseline selects phages independently by mean reciprocal rank.`;
}
