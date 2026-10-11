"""Export small, verified demonstration banks from an existing research checkout.

Python standard library only. All source handles are opened for reading. No
research code is imported or executed. Normal use writes only public/data in
this repository; --check verifies existing artifacts without writing anything.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import re
import zipfile
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[1]
BASEL = "data/results_v2/basel_ecor_validation/"
ADDITIONAL = "data/results_v2/additional_banks/"
RAW_BASEL = "data/external_validation/basel_ecor_2026/SEALED_BASEL_ECOR_interaction_matrix.csv"
RAW_ARCHIVE = "data/external_validation/genophi_2026/processed_data.zip"
ARCHIVE_MEMBER = "GenoPHI_processed_data/interaction_matrices_all_datasets.csv"
PSEUDOMONAS_GROUPING = "identity"  # Fixed demo setting, never selected from outcomes.


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def natural_key(value: str) -> list:
    return [int(part) if part.isdigit() else part.lower()
            for part in re.split(r"(\d+)", value)]


class SourceReader:
    def __init__(self, root: Path):
        self.root = root
        self.files: dict[str, dict] = {}

    def read(self, relative: str, purpose: str) -> bytes:
        path = (self.root / relative).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Source path escaped the supplied research root")
        content = path.read_bytes()
        self.files[relative] = {
            "path": relative, "sha256": digest(content),
            "bytes": len(content), "purpose": purpose,
        }
        return content

    def json(self, relative: str, purpose: str) -> dict:
        return json.loads(self.read(relative, purpose))

    def csv(self, relative: str, purpose: str) -> list[dict]:
        return csv_rows(self.read(relative, purpose))


def csv_rows(content: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(content.decode("utf-8-sig"))))


def unique_pairs(rows: list[dict], host_column: str) -> dict[tuple[str, str], dict]:
    pairs: dict[tuple[str, str], dict] = {}
    for row in rows:
        key = (row[host_column], row["phage"])
        if key in pairs:
            raise ValueError(f"Duplicate pair: {key}")
        pairs[key] = row
    return pairs


def observed_value(value: str) -> int:
    if value not in ("0", "1"):
        raise ValueError(f"Nonbinary source observation: {value!r}")
    return int(value)


def ranking_score(value: str) -> float:
    score = float(value)
    if not math.isfinite(score) or not 0 <= score <= 1:
        raise ValueError(f"Invalid saved score: {value!r}")
    return score


def auroc(pairs: list[dict]) -> float:
    """Rank-sum AUROC with exact handling of tied raw scores."""
    ordered = sorted(pairs, key=lambda pair: pair["score"])
    n_positive = sum(pair["observed"] for pair in ordered)
    n_negative = len(ordered) - n_positive
    if n_positive == 0 or n_negative == 0:
        raise ValueError("AUROC needs both observed classes")
    positive_ranks = 0.0
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and ordered[end]["score"] == ordered[start]["score"]:
            end += 1
        average_rank = (start + 1 + end) / 2
        positive_ranks += average_rank * sum(pair["observed"] for pair in ordered[start:end])
        start = end
    return (positive_ranks - n_positive * (n_positive + 1) / 2) / (n_positive * n_negative)


def join_pairs(predictions: dict, observations: dict, audited: dict | None = None) -> list[dict]:
    if predictions.keys() != observations.keys():
        raise ValueError("Saved prediction and independent assay identifiers differ")
    if audited is not None and predictions.keys() != audited.keys():
        raise ValueError("Evaluated prediction identifiers differ")
    pairs = []
    for (host, phage), prediction in predictions.items():
        score = ranking_score(prediction["score"])
        observation = observed_value(observations[(host, phage)]["interaction"])
        if audited is not None:
            audit = audited[(host, phage)]
            if score != ranking_score(audit["score"]) or observation != observed_value(audit["label"]):
                raise ValueError(f"Saved evaluation disagrees with independent join: {host}/{phage}")
        if "label" in prediction and observation != observed_value(prediction["label"]):
            raise ValueError(f"Prediction artifact observation disagrees with raw source: {host}/{phage}")
        pairs.append({"host": host, "phageId": phage, "score": score, "observed": observation})
    return pairs


def host_rows(pairs: list[dict], metadata: dict | None = None) -> list[dict]:
    hosts = []
    for host in sorted({pair["host"] for pair in pairs}, key=natural_key):
        row = {
            "id": host,
            "pairs": [{key: value for key, value in pair.items() if key != "host"}
                      for pair in sorted((pair for pair in pairs if pair["host"] == host),
                                         key=lambda pair: natural_key(pair["phageId"]))],
        }
        if metadata and host in metadata:
            row["accession"] = metadata[host]["wgs_master"]
        hosts.append(row)
    return hosts


def statistics(hosts: list[dict], phages: list[dict], pairs: list[dict]) -> dict:
    positive = sum(pair["observed"] for pair in pairs)
    return {"hosts": len(hosts), "phages": len(phages), "pairs": len(pairs),
            "positive": positive, "negative": len(pairs) - positive,
            "missing": len(hosts) * len(phages) - len(pairs)}


def basel_bank(reader: SourceReader) -> dict:
    predictions = unique_pairs(reader.csv(BASEL + "frozen_predictions.csv", "Frozen saved ranking scores; no refitting"), "host")
    observations = unique_pairs(reader.csv(RAW_BASEL, "Independent original binary assay observations"), "strain")
    audited = unique_pairs(reader.csv(BASEL + "evaluated_predictions.csv", "Verify independent score/observation join and phage clusters"), "host")
    evaluation = reader.json(BASEL + "evaluation.json", "Saved evaluation metrics and limitations")
    lock = reader.json(BASEL + "prediction_lock.json", "Recorded prediction freeze and original source hashes")
    identifiers = reader.json(BASEL + "identifier_manifest.json", "Pinned original matrix URL, commit and digest")
    mapping = reader.json(BASEL + "genome_accession_mapping.json", "Published phage genus/name/accession and host accession mapping")
    if reader.files[BASEL + "frozen_predictions.csv"]["sha256"] != lock["sha256"]["data\\results_v2\\basel_ecor_validation\\frozen_predictions.csv"]:
        raise ValueError("Frozen prediction checksum differs from research lock")
    if reader.files[BASEL + "prediction_lock.json"]["sha256"] != evaluation["prediction_lock_sha256"]:
        raise ValueError("Evaluation prediction-lock checksum differs")
    if reader.files[RAW_BASEL]["sha256"] != identifiers["sha256"]:
        raise ValueError("Raw observation checksum differs from identifier manifest")
    pairs = join_pairs(predictions, observations, audited)
    if not math.isclose(auroc(pairs), evaluation["metrics"]["roc_auc"], abs_tol=1e-12):
        raise ValueError("Recomputed BASEL AUROC differs from saved evaluation")
    phages = []
    for phage in sorted({pair["phageId"] for pair in pairs}, key=natural_key):
        groups = {int(row["phage_cluster"]) for (host, candidate), row in audited.items() if candidate == phage}
        if len(groups) != 1:
            raise ValueError(f"Inconsistent sequence cluster: {phage}")
        metadata = mapping["phages"][phage]
        phages.append({"id": phage, "cluster": next(iter(groups)), "genus": metadata["genus"],
                       "name": metadata["published_name"], "accession": metadata["accession"]})
    hosts = host_rows(pairs, mapping["hosts"])
    counts = statistics(hosts, phages, pairs)
    if counts != {"hosts": 25, "phages": 52, "pairs": 1240, "positive": 302, "negative": 938, "missing": 60}:
        raise ValueError(f"Unexpected BASEL bank dimensions: {counts}")
    return {
        "id": "basel-ecor", "name": "BASEL–ECOR", "species": "Escherichia coli",
        "description": "Saved sequence-only model predictions paired with recorded BASEL phage–ECOR host assays.",
        "predictionMode": "Saved frozen predictions", "model": "Previously saved 444-input sequence-only model",
        "predictionLockedUtc": lock["locked_utc"], "evaluationMode": "Source-held-out retrospective evaluation",
        "scoreMeaning": "Raw saved model score for ranking; not a calibrated susceptibility probability.",
        "observationMeaning": "Binary recorded individual phage–host assay; not a tested mixture or clinical outcome.",
        "clusterMeaning": "Canonical k=21, 2,048-hash sequence clusters at Mash-form distance 0.05; not ANI or a validated cocktail diversity rule.",
        "limitations": [
            "Saved AUROC is 0.470, below the chance reference of 0.5; this bank does not establish useful discrimination.",
            "Severe miscalibration: saved expected calibration error is 0.744; the raw scores are not reliable probabilities.",
            "All 25 hosts fall in one sequence cluster at distance 0.05; the primary cluster-bootstrap confidence interval is unavailable.",
            "Every external host is within distance 0.05 of a training reference; this is not dual-axis sequence-cold validation.",
            "The full 448-input model could not be evaluated because four VHIP columns were unavailable.",
            "60 of 1,300 possible bank cells have neither an included saved score nor an assay observation and are omitted from rankings.",
            "Recorded prediction locking on public data does not independently certify historical blinding.",
            "Candidate mixtures have not been tested for interactions, resistance, safety, or treatment efficacy.",
        ],
        "metrics": {"auroc": evaluation["metrics"]["roc_auc"], "averagePrecision": evaluation["metrics"]["pr_auc"],
                    "ece": evaluation["calibration"]["ece"], "brier": evaluation["metrics"]["brier"],
                    "primaryConfidenceInterval": None, "confidenceIntervalNote": evaluation["ci95"]["unavailable"]},
        "statistics": counts, "sourceIds": ["genophi-pinned", "noonan-2026", "basel-2025", "ecor-2018"],
        "phages": phages, "hosts": hosts,
    }


def pseudomonas_bank(reader: SourceReader) -> dict:
    saved = reader.csv(ADDITIONAL + "pair_predictions.csv", "Saved additional-bank predictions; fixed Pseudomonas identity-fold subset")
    selected = [row for row in saved if row["bank"] == "Pseudomonas" and row["grouping"] == PSEUDOMONAS_GROUPING]
    predictions = unique_pairs(selected, "host")
    report = reader.json(ADDITIONAL + "summary.json", "Saved bank-specific evaluation and source provenance")
    archive = reader.read(RAW_ARCHIVE, "Published processed interaction matrix archive; original assay observations")
    if digest(archive) != report["checksums"]["processed_data.zip"]:
        raise ValueError("Processed source archive checksum differs from saved evaluation")
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        matrix_content = zipped.read(ARCHIVE_MEMBER)
    reader.files[RAW_ARCHIVE]["consumedMember"] = {"path": ARCHIVE_MEMBER, "sha256": digest(matrix_content), "bytes": len(matrix_content)}
    observations = unique_pairs([row for row in csv_rows(matrix_content) if row["dataset"] == "Pseudomonas"], "strain")
    pairs = join_pairs(predictions, observations)
    summary = next(item for item in report["summaries"] if item["bank"] == "Pseudomonas" and item["grouping"] == PSEUDOMONAS_GROUPING)
    if not math.isclose(auroc(pairs), summary["pair_auroc"], abs_tol=1e-12):
        raise ValueError("Recomputed Pseudomonas AUROC differs from saved evaluation")
    for host in {pair["host"] for pair in pairs}:
        if len({row["fold"] for row in selected if row["host"] == host}) != 1:
            raise ValueError(f"Host occurs in multiple held-out folds: {host}")
    phages = [{"id": phage, "cluster": None} for phage in sorted({pair["phageId"] for pair in pairs}, key=natural_key)]
    hosts = host_rows(pairs)
    counts = statistics(hosts, phages, pairs)
    if counts != {"hosts": 23, "phages": 19, "pairs": 437, "positive": 158, "negative": 279, "missing": 0}:
        raise ValueError(f"Unexpected Pseudomonas bank dimensions: {counts}")
    return {
        "id": "pseudomonas", "name": "Pseudomonas", "species": "Pseudomonas (source genus label)",
        "description": "Saved nested held-out host predictions from a published 19-phage Pseudomonas bank.",
        "predictionMode": "Saved cross-validation predictions", "model": "Bank-specific nearest-neighbour selector",
        "evaluationMode": "Five outer held-out host folds; three inner folds tune neighbour count; identity grouping",
        "scoreMeaning": "Raw saved neighbour score for ranking; calibration was not established.",
        "observationMeaning": "Binary recorded individual phage–host assay; not a tested mixture or clinical outcome.",
        "clusterMeaning": "Phage sequence diversity metadata unavailable for this bank.",
        "limitations": [
            "The model was trained within this bank; it does not demonstrate transport of frozen weights to a new data source.",
            "Identity grouping is a fixed demo setting; related-host grouped saved AUROC falls to 0.619 at 0.0001 and 0.509 at 0.001.",
            "Only 23 hosts are represented; saved metrics condition on the existing fits and source panel.",
            "No phage sequence cluster metadata is available; no phage diversity or compatibility constraint can be inferred.",
            "Source phage and host accessions retain their published identifier forms; no fuzzy matches were introduced.",
            "Candidate mixtures have not been tested for interactions, resistance, safety, or treatment efficacy.",
        ],
        "metrics": {"auroc": summary["pair_auroc"], "averagePrecision": summary["pair_ap"], "ece": None,
                    "primaryConfidenceInterval": None, "confidenceIntervalNote": "No pair-AUROC confidence interval supplied for this demonstration subset."},
        "statistics": counts, "sourceIds": ["genophi-zenodo", "noonan-2026"], "phages": phages, "hosts": hosts,
    }


def encode(value: dict, compact: bool = False) -> bytes:
    return (json.dumps(value, ensure_ascii=False, allow_nan=False,
                       separators=(",", ":") if compact else None,
                       indent=None if compact else 2) + "\n").encode("utf-8")


def export(source_root: Path) -> tuple[bytes, bytes]:
    reader = SourceReader(source_root)
    banks = [basel_bank(reader), pseudomonas_bank(reader)]
    bank = encode({"schemaVersion": 1, "datasetVersion": "saved-research-2026-10-06-demo-v1",
                   "notice": "Saved predictions and recorded assays. Candidate cocktails are for further testing; no selected mixture is validated.",
                   "banks": banks}, compact=True)
    provenance = {
        "schemaVersion": 1, "datasetVersion": "saved-research-2026-10-06-demo-v1",
        "sourceAccess": "Read-only local research snapshot. No research script was run, source modified, or model fitted.",
        "exportMethod": "Scores joined by exact host/phage identifiers to independent raw observations; audited against saved evaluated labels. Rankings never use labels.",
        "predictionSubset": {"basel-ecor": "All 1,240 saved evaluated predictions", "pseudomonas": "All 437 saved rows with bank=Pseudomonas and grouping=identity"},
        "selectionScope": "UI selects candidates from stored raw scores; no retraining, calibrated probability, mixture prediction, or clinical validation.",
        "missingness": "Unscored/unobserved BASEL cells are omitted, never imputed as negative. Pseudomonas has no missing cells.",
        "files": [reader.files[path] for path in sorted(reader.files)],
        "generatedFiles": [{"path": "public/data/bank.json", "sha256": digest(bank), "bytes": len(bank)}],
        "extractor": {"path": "scripts/extract-data.py", "sha256": digest(Path(__file__).read_bytes())},
        "sources": [
            {"id": "genophi-pinned", "title": "GenoPHI BASEL–ECOR assay matrix at pinned commit f7e30abc1b0bbba1ae76b8f58a3363bbbc5cd54f",
             "url": "https://github.com/Noonanav/GenoPHI/blob/f7e30abc1b0bbba1ae76b8f58a3363bbbc5cd54f/data/experimental_validation/BASEL_ECOR_interaction_matrix.csv",
             "terms": "GenoPHI repository MIT license; retain original notices and publication attribution.",
             "licenseUrl": "https://github.com/Noonanav/GenoPHI/blob/f7e30abc1b0bbba1ae76b8f58a3363bbbc5cd54f/LICENSE"},
            {"id": "genophi-zenodo", "title": "GenoPHI processed data (Noonan et al.)", "url": "https://doi.org/10.5281/zenodo.21696332",
             "terms": "CC BY 4.0 for the processed dataset; attribute Noonan et al. and original experiments.", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"},
            {"id": "noonan-2026", "title": "Noonan et al. (2026), Phylogeny-agnostic strain-level prediction of phage–host interactions from genomes using machine learning",
             "url": "https://doi.org/10.1038/s41564-026-02482-5", "role": "Publication explaining GenoPHI bank provenance; article terms are separate from dataset terms."},
            {"id": "basel-2025", "title": "Humolli et al. (2025), PLOS Biology 23(4): e3003063; BASEL supplementary phage table S2",
             "url": "https://doi.org/10.1371/journal.pbio.3003063", "dataUrl": "https://doi.org/10.1371/journal.pbio.3003063.s002",
             "terms": "CC BY; preserve original author attribution."},
            {"id": "ecor-2018", "title": "Patel et al. (2018), Microbiology Resource Announcements 7(14): e01133-18; ECOR genome provenance",
             "url": "https://doi.org/10.1128/MRA.01133-18", "role": "Published ECOR genome accession provenance; no genome sequences copied into this website."},
        ],
        "attribution": "PrecisionPhage website export adapted existing saved research artifacts. Original datasets, experiments, genomes, and models predate the website build.",
        "licenseSeparation": "Website code licensing does not replace original source-data licenses or publication terms.",
    }
    return bank, encode(provenance)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(r"D:\full_pipeline"))
    parser.add_argument("--output", type=Path, default=REPOSITORY / "public" / "data")
    parser.add_argument("--check", action="store_true", help="Verify checked-in export without writing files")
    args = parser.parse_args()
    source_root, output = args.source.resolve(), args.output.resolve()
    if output == source_root or output.is_relative_to(source_root):
        parser.error("Output must be outside the read-only research project")
    bank, provenance = export(source_root)
    if args.check:
        for name, expected in [("bank.json", bank), ("provenance.json", provenance)]:
            if (output / name).read_bytes() != expected:
                raise SystemExit(f"Export differs: {name}")
        print("Verified deterministic exports, source hashes, independent joins, dimensions and AUROC.")
        return
    output.mkdir(parents=True, exist_ok=True)
    (output / "bank.json").write_bytes(bank)
    (output / "provenance.json").write_bytes(provenance)
    print(f"Exported 2 banks, 48 hosts, 71 bank phages and 1,677 scored assay pairs to {output}")


if __name__ == "__main__":
    main()
