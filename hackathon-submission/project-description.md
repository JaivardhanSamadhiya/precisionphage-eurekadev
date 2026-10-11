# PrecisionPhage

**A transparent next-experiment workbench for phage research.**

Suggested track: Coding. Suggested category: Biology/Medical and Environmental Science.

[Live demo](https://jaivardhansamadhiya.github.io/precisionphage-eurekadev/) · [Public source and setup](https://github.com/JaivardhanSamadhiya/precisionphage-eurekadev)

## Why this project

Antimicrobial resistance makes some infections harder to treat and creates a need for further research. [WHO describes it as a major global health threat](https://www.who.int/news-room/fact-sheets/detail/antimicrobial-resistance). Phages offer an interesting research direction, but a prediction table alone does not tell a researcher what to test with a limited screening budget or how much trust to place in the ranking.

PrecisionPhage makes that decision inspectable. Users choose an evaluated bacterial host, inspect ranked phages, allocate individual screens, and receive a candidate mixture for a later experiment. Recorded single-phage observations appear alongside the proposal. The interface identifies saved predictions, their sources, and the questions they cannot answer.

## What works

- Two evaluated banks: 25 ECOR hosts and 52 BASEL phages, plus 23 Pseudomonas hosts and 19 phages.
- Saved-score rankings and adjustable individual-screen budgets.
- Candidate cocktails drawn from the shortlist, using known sequence clusters as a diversity proxy where available.
- A retrospective budget frontier comparing score order, analytic random-screen expectations, and a hindsight upper bound.
- A shared-panel planner combining reciprocal ranks across hosts, with exact optimization for small searches.
- JSON testing plans carrying candidates, scores, observations, provenance, and source hashes.
- A responsive static website requiring no model service, account, GPU, or research environment.

## What makes it different

The project keeps evidence quality inside the planning workflow. The frozen BASEL–ECOR model has AUROC approximately 0.470 and very high scores. For ECOR12, the first five candidates are recorded negatives despite scores near 0.998. This failure is visible: a polished interface should make a weak model easier to question.

The budget frontier asks how many recorded positives a ranking recovers at each budget, compared with uniform random screening. Its oracle shows the best possible historical recovery if all outcomes were known in advance. This is a hindsight reference, not a deployable selection policy.

The shared-panel planner asks which small set best represents highly ranked options across all included hosts. It uses within-host reciprocal ranks because raw scores are not calibrated across hosts. Its explicit objective is optimized exactly when the combination count is at most 50,000 and greedily otherwise. Rank representation does not mean infection coverage or cocktail efficacy.

The second bank uses a separate retrospective evaluation. Its identity-grouped AUROC is approximately 0.729, but stricter related-host grouping lowers performance. The website preserves the difference between this workflow and frozen model transfer.

## How it was built

JavaScript ES modules, HTML, CSS, compact JSON, and Node's built-in APIs power the app. Pure functions handle planning and retrospective analysis; browser modules render decisions. A Python standard-library extractor reads original research files without executing them, joins scores and observations by exact identifiers, and records SHA-256 hashes.

Sixty tests check budgets, missingness, stable ties, independence from historical labels, analytic baselines, exact-search behavior, source consistency, exports, and serving. GitHub Actions checks and builds the public GitHub Pages deployment. The browser also verifies the raw snapshot bytes against the committed manifest before displaying evidence.

## Scope and next steps

This website and integration were built on 11 October 2026 for EurekaDEV. Existing PrecisionPhage research code, trained artifacts, saved predictions, and published assay data are reused and attributed. Codex assisted implementation, inspection, testing, and writing. [The build disclosure](built-during-event.md) separates new work from existing inputs.

Potential impact is clearer experimental prioritization and review. A next study would prospectively compare a frozen selection policy with suitable baselines and assay proposed mixtures separately. Historical activity of a constituent does not validate a cocktail's activity, compatibility, safety, or resistance suppression. No treatment outcome or measured laboratory savings are claimed.

## References

- [PrecisionPhage research software](https://github.com/JaivardhanSamadhiya/precisionphage), Jaivardhan Samadhiya.
- [Noonan et al., GenoPHI, Nature Microbiology (2026)](https://doi.org/10.1038/s41564-026-02482-5), and [associated public data](https://doi.org/10.5281/zenodo.21696332).
- [Humolli et al., BASEL phage collection, PLOS Biology (2025)](https://doi.org/10.1371/journal.pbio.3003063).
- [Patel et al., ECOR genome sequences (2018)](https://doi.org/10.1128/MRA.01133-18).

[Sources](../docs/SOURCES.md) and the downloadable manifest give exact source versions, terms, and transformations.

Before copying into Devpost, add actual team names and a recorded video link. Do not describe existing research or assays as new website work.
