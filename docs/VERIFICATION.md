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
- Responsive check at a 375-pixel viewport: no horizontal page overflow; ranking and matrix tables retain their own scroll regions. The new host-panel controls remain usable in a single column.
- Fresh public clone: all 60 tests, data/module checks, and static build passed using committed files only, including the documentation and submission folder.

The README, methods, source citations, and submission folder are included in the public release. Generated builds, browser downloads/screenshots, caches, and verification clones are excluded. Commits record actual changes at their original times.

## Publication

Public repository: [precisionphage-eurekadev](https://github.com/JaivardhanSamadhiya/precisionphage-eurekadev).

[Live HTTPS workbench](https://jaivardhansamadhiya.github.io/precisionphage-eurekadev/).

The initial deployment from `add7882d503f1d442fe7292dd2751bf99405dc89` passed both verification and [Pages publication](https://github.com/JaivardhanSamadhiya/precisionphage-eurekadev/actions/runs/38182946685). All 14 published assets were fetched and compared byte-for-byte with `public/`. Compact bank SHA-256: `5464517ffdc06a3ae7e4bba3bf4c4fcd6ebc2c2e7feb62927611b75948585afb`.

Hosted browser checks loaded both banks with the verified-snapshot badge, ran the exact 171-panel example, and downloaded a shared panel and single-host testing plan. The downloads retained the saved dataset version and candidate-for-further-testing status. No console errors or warnings were observed. Later documentation and source-link updates use the same automated check/build/deploy workflow.

GitHub attributes the public commits to `JaivardhanSamadhiya`. The repository is public; generated artifacts and the research checkout are absent from its tracked files. The entrant still needs to record/upload the video, supply actual team information, join the required event communities, and submit on Devpost.
