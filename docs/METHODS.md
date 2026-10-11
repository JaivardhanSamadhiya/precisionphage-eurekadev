# What the demo computes

## Evidence model

Each bank contains its evaluated hosts and phages, saved numeric pair scores, and an independently joined field for the recorded individual-phage assay. `observed=1` is an experimentally positive interaction in the source; `observed=0` is a recorded negative; the planner supports `observed=null` as unavailable. The 60 unlisted BASEL cells lack both scores and observations and are omitted from the compact pair lists; the website reports how many are unavailable. A missing measurement must never be filled with zero. The website cannot infer a new phage-host pair from a name, upload, or genome.

The website selects among listed hosts only and reuses saved scores. Ranking sorts by descending score and uses a stable identifier tie break. No classification threshold is advertised as an infection probability. Comparisons operate on the displayed snapshot and describe retrospective experimental agreement.

## Screening and candidate mixtures

The testing budget is the maximum number of distinct individual phage screens a user plans for the selected host. It must be an integer from one through the number of finite saved scores for that host. The shortlist takes exactly the top-ranked phages up to that budget. Candidate mixture size must be from one through the smaller of the budget and six. The mixture is intended for a subsequent mixture experiment. The planner does not use the recorded observation field to decide candidates; observations provide retrospective comparison, not ranking inputs.

Selection starts with the highest-ranked shortlisted phage, then adds the highest-ranked phages whose known sequence cluster has not yet been represented, and finally fills any remaining slots by rank. Every chosen phage must come from the shortlist. Unknown clusters are not counted as evidence of distinct groups. This is a deterministic heuristic, not a trained mixture predictor, and cluster identifiers are supplied metadata rather than proof of receptor diversity, independent resistance, compatibility, genomic safety, or biochemical synergy. Pseudomonas has no cluster metadata, so its mixture follows saved-score rank. Assaying constituents individually and assaying the mixture are different experiments.

Ranked candidates can disagree with recorded observations. This is a useful demonstration of how a research workflow can fail. A positive historical observation applies to that source assay and cannot be extrapolated to a different isolate, environment, laboratory protocol, or patient.

## BASEL–ECOR interpretation

The source contains 25 ECOR hosts by 52 BASEL phages, with 1,240 recorded pairs: 302 positives and 938 negatives. The other 60 cells in the possible 1,300-cell grid are unavailable. Predictions came from an already fitted 444-input PrecisionPhage sequence-only model; the website performs zero fits. The full 448-input model could not be applied because four supplied VHIP features were unavailable. Input compatibility determined this research model choice.

Saved AUROC is 0.4695368 and average precision is 0.2216794; Brier score is 0.7380530 and ten-bin expected calibration error is 0.7440046. These are negative transfer evidence. Every saved score is above 0.5, with a mean near 0.9876, while the observed positive rate is 24.35%. Showing those values as calibrated confidence would mislead users.

No exact training-genome contig-set match was found, but all 25 host entities fall in one connected sequence cluster at the audited 0.05 sketch-distance threshold; all are within that threshold of training material. Thirty-one of 52 phages are within that threshold. Thus absence of exact matches does not establish absence of related-entity overlap. The two-way cluster bootstrap confidence interval is unavailable because an entity axis has fewer than two clusters; row independence or a made-up confidence interval would be inappropriate.

The saved research lock and checksums record staged predictions before the recorded evaluation. These are public historical data, with neither prospective collection nor independently certified blinding. The website makes no new confirmatory validation claim.

## Pseudomonas interpretation

The additional bank has 23 hosts and 19 phages, with all 437 pairs measured and 158 positives. The website uses the saved identity-grouped, nested five-fold nearest-neighbour predictions from PrecisionPhage's additional-bank analysis. This workflow trained separately within the bank. It is neither frozen transport of the BASEL model nor an execution of the GenoPHI predictor.

For the chosen identity grouping, saved AUROC is 0.7294587 and average precision is 0.5881723. Related-host grouping produces lower AUROC, approximately 0.619 at threshold 0.0001 and 0.509 at 0.001. Grouping uses source tree branch lengths; these are source-specific distances rather than direct ANI estimates. Phage sequence-cluster metadata is absent in this compact bank, so the planner reports that limitation and follows saved-score rank without claiming genetic diversity.

The recorded union of active individual constituents is not a measured cocktail endpoint. The app may display how many planned candidates had positive source assays, but it must label that statistic as constituent-level retrospective evidence.

## Retrospective budget frontier

The audit first takes pairs with both a finite score and a recorded binary observation. Unknown outcomes and missing scores are reported separately and excluded from every comparison. If this cohort has `N` pairs and `P` positives, the score-order curve counts positives in its first `k` pairs. Uniform sampling without replacement has expected hits `kP/N`; its expected precision is `P/N`, and expected recall is `k/N` when `P > 0`. The probability of at least one hit is `1 - C(N-P,k)/C(N,k)`, evaluated as a product to avoid large factorials. Impossible all-negative draws give probability one.

The hindsight oracle recovers `min(k,P)` positives. It uses the recorded labels and is only an upper bound. Neither random expectations nor hindsight results are prospective experiments. Recall is undefined when no recorded positives exist. Bank summaries cap the budget separately for each host and distinguish zero-hit hosts with known positives from hosts without positive evidence. Screening burden records the first positive rank, the budget needed for half the known positives, and the budget needed for all of them.

## Shared screening panels across hosts

For a selected host `h`, each scored phage has its deterministic within-host rank `r_h(p)`. Its utility is `1/r_h(p)`; an unscored pair contributes zero to this preference objective, without becoming a negative assay. A panel `S` maximizes `U(S) = mean_h max_{p in S} 1/r_h(p)`. This rewards complementarity across hosts without comparing uncalibrated raw scores. Selection uses saved ranks only; recorded labels are rendered separately after selection.

The eligible pool is the union of scored phages for the selected hosts. Greedy search adds the member with the greatest marginal utility, using identifier order to resolve ties. If the number of size-`s` combinations is at most 50,000, an exhaustive search evaluates all panels and returns the exact best panel for this objective. Larger searches return the greedy panel without claiming an optimum. The reference baseline takes the `s` phages with highest mean individual reciprocal rank, independently of complementarity.

The interface also reports how many selected hosts have a top-three member and how much objective utility each member contributes when removed. A zero removal loss exposes a redundant slot under this objective. These are saved-rank diagnostics, not biological infection coverage or evidence of mixture activity. The UI limits the panel to six hosts and six phages to keep the workflow inspectable.

For the demonstration hosts `GCA_030068835`, `GCA_030068895`, and `GCA_030069025`, a two-member panel selects `ON857925` and `ON857930`, with utility 1.000 versus the independent baseline's 0.778. Exact search examines 171 panels. This is an algorithm example on saved preferences, not a new experimental result.

## Snapshot integrity

The browser verifies the bank JSON's raw byte length and SHA-256 digest against the committed provenance manifest before displaying it. It then checks schema versions, identifiers, and referenced sources. This detects mismatched or corrupted assets; it does not authenticate the manifest independently or certify scientific validity. HTTPS on GitHub Pages and a local HTTP server on localhost support the browser's Web Crypto API.

## Validation boundaries

Application tests check software behavior, budgets, selection stability, provenance/data consistency, missingness, and independence of selection from revealed observations. Passing these tests validates the implementation, not the biological model. This build performs no wet-lab experiments, retraining, novel host inference, pharmacology, clinical evaluation, or validated treatment recommendation.

The JSON testing-plan export records the selected host/bank, budget, mixture size, rank-based method, shortlisted and candidate members, retrospective observations, sequence-diversity metadata, saved-prediction status, and further-testing disclaimer. Source citations and provenance travel with the exported plan. Those fields make the software decision inspectable; they do not create new scientific evidence.

## Recreate the compact snapshot

The Python standard-library extractor reads the local research files and writes only to this repository. It does not import or execute research modules. With the original read-only source available:

```powershell
py scripts/extract-data.py --check
```

The check compares deterministic output bytes with the shipped data. To create a new explicitly versioned snapshot, use `py scripts/extract-data.py --source D:\full_pipeline --output public/data`; review the changed manifest, identifiers, labels, and data before committing. This optional extraction step requires Python; normal website operation and Node tests do not.
