# PrecisionPhage

**Which phages should a lab test next when it cannot test every candidate?**

PrecisionPhage is a browser workbench for that question. Choose a bacterial host from an evaluated bank, inspect its saved phage ranking, set a screening budget, and export a candidate cocktail for further testing. Recorded single-phage assays sit beside the ranking so a convincing score can be checked against what actually happened.

Built for [EurekaDEV 2026](https://eurekadev.devpost.com/), Coding Track / Biology, Medical and Environmental Science. This prototype uses **saved predictions**, including a model transfer failure. Raw scores are not infection probabilities, and proposed mixtures have not been validated as treatments.

## Try it

[Open the live workbench](https://jaivardhansamadhiya.github.io/precisionphage-eurekadev/) or [browse the public repository](https://github.com/JaivardhanSamadhiya/precisionphage-eurekadev). The HTTPS demo and its exports were checked after deployment; [verification notes](docs/VERIFICATION.md) record the checks.

Install Node.js 22 or later, then run:

```sh
git clone https://github.com/JaivardhanSamadhiya/precisionphage-eurekadev.git
cd precisionphage-eurekadev
npm start
```

Open [localhost:4173](http://127.0.0.1:4173). There are no runtime dependencies to install, API keys, or model downloads. The website loads only the compact files included here.

| Command | Purpose |
| --- | --- |
| `npm start` | Serve the website locally |
| `npm test` | Run the Node test suite |
| `npm run check` | Check data integrity and JavaScript syntax |
| `npm run build` | Create the static `dist/` site |

To use another port in PowerShell, run `$env:PORT = '4200'` before `npm start`. Serve the site over HTTP; opening `index.html` directly prevents its modules and JSON from loading.

## A useful first experiment

1. Choose **BASEL–ECOR**, host **ECOR12**, and budget **5**.
2. Compare the top five scores with their recorded assays. All five are negative despite scores near 0.998. This host has 14 recorded positives elsewhere in its ranking.
3. Increase the budget and compare the saved ranking with the random-screen baseline and hindsight bound.
4. Switch to **Pseudomonas**, host **GCA_000006765**, and budget **3**. Its first three ranked phages have recorded positive individual assays.
5. Explore a shared panel across the bank, then export the single-host testing plan with its method, sources, and snapshot hashes.

The contrast is deliberate. A workbench should expose when a ranking fails, as well as when it appears useful. The banks have different models and evaluation settings, so this is not a controlled comparison between models.

## Evidence and planning

| Bank | Hosts | Phages | Measured pairs | Saved evaluation |
| --- | ---: | ---: | ---: | --- |
| BASEL–ECOR / *E. coli* | 25 | 52 | 1,240 | Frozen sequence-only model transfer; AUROC 0.4695 |
| Pseudomonas | 23 | 19 | 437 | Bank-specific nested five-fold evaluation, host identity grouping; AUROC 0.7295 |

BASEL has 60 unavailable cells, never filled with negative labels. Every included BASEL score exceeds 0.5, while only 302 measured pairs are positive; its ten-bin calibration error is 0.7440. Pseudomonas performance weakens under stricter related-host grouping, to AUROC approximately 0.619 and 0.509.

Budget means planned **individual phage screens**, not money or dose. The cocktail heuristic chooses from that shortlist and favors distinct known sequence clusters where available. Cluster variety does not establish compatible mechanisms or mixture activity. Recorded outcomes never influence candidate selection.

The retrospective budget frontier compares positives recovered by score order with uniform random screening and an explicitly labeled hindsight oracle. The shared-panel planner combines within-host reciprocal ranks rather than uncalibrated score magnitudes. Small searches find the exact best panel; larger searches use a deterministic greedy method. Its objective describes rank representation, not biological host coverage. [Methods](docs/METHODS.md) gives formulas and limits.

## Code and data

HTML, CSS, and JavaScript ES modules power the website. Pure planning and analysis functions are separate from DOM rendering. Node's built-in APIs handle serving, tests, and builds.

```text
public/                  website controller and planning modules
public/ui/               browser rendering modules
public/data/             compact banks, provenance, retained notices
scripts/                 server, build, checks, read-only extraction
tests/                   planning, analysis, data, export, server checks
docs/                    methods, citations, verification
hackathon-submission/    written pitch, video script, build disclosure
```

The original `D:\full_pipeline` research project was read only. The runtime needs none of its genomes, weights, or Python environment. If that folder is available, `py scripts/extract-data.py --check` verifies deterministic regeneration without executing research code. See [Sources and attribution](docs/SOURCES.md) for publications, source paths, and licensing details.

The GitHub Pages workflow checks, tests, and builds before publishing `dist/`. Relative asset paths support the repository URL.

## Event work

This new website, integration, planning interface, tests, and submission materials were built on 11 October 2026, within the advertised event dates. Research software, saved model results, and published assays already existed when this build began. The website generates no new biological predictions or experiments. [The build disclosure](hackathon-submission/built-during-event.md) separates those contributions and records Codex assistance.

The submission folder includes a [demo script](hackathon-submission/demo-script.md) under four minutes and a [judging evidence guide](hackathon-submission/judging-rubric.md). The participant must supply the final video and entrant details.
