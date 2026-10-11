# Demo script — 3 minutes 40 seconds

Use the deployed [workbench](https://jaivardhansamadhiya.github.io/precisionphage-eurekadev/) at readable desktop zoom. Rehearse once and keep the recording under the four-minute limit. Speak in your own words; this is a sequence of evidence to show.

## 0:00–0:25 — the decision

“Which phages should a lab test next when it cannot screen every option? PrecisionPhage lets a researcher inspect saved predictions, allocate individual tests, and propose candidates. It also shows when a model's ranking fails. These are existing predictions and published single-phage assays, not a validated treatment.”

Show the saved-snapshot label, bank selector, and candidate qualification.

## 0:25–1:10 — a confident score can fail

Choose BASEL–ECOR, host `ECOR12`, budget five, and mixture size two. Keyboard shortcut for the budget slider: Home, then four Right arrows.

“This bank has 25 hosts and 52 phages. ECOR12 has 50 scored, measured pairs; two cells are unavailable. Its first five ranked phages are all recorded negatives despite scores near 0.998. There are 14 positives elsewhere in the ranking. A raw score is not an infection probability.”

Show the frozen model's AUROC near 0.470 and the recorded assay column. Point out that the cocktail is drawn from the shortlist and favors distinct known sequence clusters. Those clusters do not prove compatibility or resistance suppression.

## 1:10–1:55 — does the budget help?

Scroll to the budget audit. Keep budget five, then increase it to 15 and show the changing curves and summary.

“At five tests, saved rank order recovers zero recorded positives. Random screening would recover 1.4 on average from this same measured set. The first saved-rank positive appears at test 13. The dotted curve uses hindsight labels and is an upper bound, not a method we can deploy.”

Point to the bank summary. Explain that this is retrospective analysis and budget means individual screens, not money or dose. The planner never uses those recorded outcomes to select candidates.

## 1:55–2:50 — optimize a shared panel

Click **Load example panel** in the shared-panel section. It chooses three Pseudomonas hosts and a two-phage panel.

“For several hosts, picking phages independently can repeat the same preference. This planner maximizes each host's best reciprocal rank, averaged across hosts. It uses ranks because these raw scores are not calibrated across hosts.”

Show `ON857925` and `ON857930`, utility 1.000, and the independent baseline at 0.778. Show the matrix of saved ranks and separately recorded assays.

“Here the exact search checks 171 possible panels. Larger searches use a deterministic greedy method. This is an optimum for the stated rank objective, not proof of biological host coverage. Member-removal losses help expose redundant slots.”

## 2:50–3:20 — inspect and reproduce

Export the shared panel or single-host plan. Open the source disclosure.

“The export includes the method, snapshot version, scores, observations, sources, and limitations. The browser checks the saved data's SHA-256 before displaying it. The static site needs no GPU, API key, or original research folder. Sixty tests check the planning, math, data, and exports.”

## 3:20–3:40 — contribution and next study

“The event work is this website, data integration, planning algorithms, audits, tests, and deployment. Research models, predictions, and published assays were already available and are attributed. A next study would compare a frozen selection policy prospectively, then test candidate mixtures separately.”

End on the workbench and repository address. Add your actual team roles and explain Codex assistance accurately when discussing development.
