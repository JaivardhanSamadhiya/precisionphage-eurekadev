# Release verification

Checked on 11 October 2026. This records software verification; it does not validate a biological predictor or candidate mixture.

## Local release checks

- `npm test`: 60 tests passed. Coverage includes all included hosts at planning boundaries, observation-independent selection, stable ties, missingness, independently checked random expectations and exhaustive optima, immutable sourced exports, snapshot loading, and safe static serving.
- `npm run check`: passed both banks, raw compact-data integrity, and syntax checks for 12 JavaScript modules.
- `npm run build`: passed; emits static assets into `dist/` without the research folder.
- `py scripts/extract-data.py --check`: passed deterministic bytes, consumed source hashes, independent assay joins, dimensions, and recomputed AUROC. The research files were opened only for reading.
- Browser checks: bank/host switching, budget extremes, candidate size limits, full rankings, source disclosures, and downloaded testing plans passed. New checks covered the budget frontier, complementary shared-panel example, empty-host safeguard, audit/panel downloads, and URL-restored panel state.
- The complementary example selected `ON857925` and `ON857930` for the three documented Pseudomonas hosts: rank utility 1.000 versus baseline 0.778. Its export retained candidate-only status and provenance.
- Browser console: no errors or warnings observed during these checks.

The README, methods, source citations, and submission folder are included in the public release. Generated builds, browser downloads/screenshots, caches, and verification clones are excluded. Commits record actual changes at their original times.

## Publication

Public repository: [precisionphage-eurekadev](https://github.com/JaivardhanSamadhiya/precisionphage-eurekadev).

GitHub Pages deployment is being verified. The deployed version and final browser checks will be recorded here after publication succeeds.
