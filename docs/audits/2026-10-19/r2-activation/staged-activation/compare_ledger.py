#!/usr/bin/env python3
"""Offline, read-only ledger comparison. A match NEVER authorizes activation."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys

STAGES = {"baseline": 0, "0105": 1, "0106": 2, "0107": 3}
HEX = re.compile(r"[0-9a-f]{64}\Z")


class InvalidInput(ValueError):
    pass


def canonical_hash(value):
    data = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InvalidInput(f"Duplicate JSON property: {key}")
        result[key] = value
    return result


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=unique_object)


def positive_integer(value, name):
    # Canonical decimal strings accommodate bigint serialization without rounding.
    if isinstance(value, str) and re.fullmatch(r"[1-9][0-9]*", value):
        value = int(value)
    if type(value) is not int or not 0 < value <= 9223372036854775807:
        raise InvalidInput(f"{name} must be a positive exact integer")
    return value


def rows_from(value):
    if isinstance(value, dict):
        if value.get("isError") is True or value.get("error_code") or value.get("error"):
            raise InvalidInput("Snapshot reports an upstream error; rows cannot be trusted")
        if "rows" not in value:
            raise InvalidInput("Snapshot object must contain rows; tool errors are not empty ledgers")
        value = value["rows"]
    if not isinstance(value, list):
        raise InvalidInput("Snapshot rows must be an array")
    rows = []
    for index, row in enumerate(value):
        if not isinstance(row, dict) or set(row) != {"id", "created_at", "hash"}:
            raise InvalidInput(f"Row {index} requires exactly id, created_at, hash")
        if not isinstance(row["hash"], str) or not HEX.fullmatch(row["hash"]):
            raise InvalidInput(f"Row {index} requires the exact lowercase SHA-256")
        rows.append({"id": positive_integer(row["id"], "id"),
                     "created_at": positive_integer(row["created_at"], "created_at"),
                     "hash": row["hash"]})
    return sorted(rows, key=lambda row: (row["created_at"], row["id"], row["hash"]))


def duplicate_diagnostics(rows):
    result = []
    for field in ("id", "created_at"):
        for value, count in sorted(Counter(row[field] for row in rows).items()):
            if count > 1:
                result.append({"kind": "DUPLICATE_" + field.upper(), "value": value, "count": count})
    for pair, count in sorted(Counter((r["created_at"], r["hash"]) for r in rows).items()):
        if count > 1:
            result.append({"kind": "DUPLICATE_TIMESTAMP_HASH_PAIR", "created_at": pair[0],
                           "hash": pair[1], "count": count})
    return result


def validate_baseline(baseline):
    if not isinstance(baseline, dict) or type(baseline.get("schemaVersion")) is not int or baseline["schemaVersion"] != 1:
        raise InvalidInput("Unsupported baseline schema")
    if baseline.get("status") != "OBSERVED_HISTORY_REVIEW_REQUIRED_NOT_APPROVED":
        raise InvalidInput("This review comparator accepts only the explicitly unapproved artifact")
    if baseline.get("activationAuthorized") is not False:
        raise InvalidInput("Baseline must not authorize activation")
    rows = rows_from(baseline["observation"]["rows"])
    if len(rows) != 106 or duplicate_diagnostics(rows):
        raise InvalidInput("Preserved baseline must contain exactly 106 unique rows")
    if canonical_hash(rows) != baseline["observation"]["canonicalRowsSha256"]:
        raise InvalidInput("Baseline row fingerprint mismatch")
    journal = baseline["currentJournal"]["entries"]
    if not isinstance(journal, list) or len(journal) != 108:
        raise InvalidInput("Expected the complete 108-entry reviewed journal")
    previous = 0
    tags = set()
    for idx, entry in enumerate(journal):
        if not isinstance(entry, dict):
            raise InvalidInput("Each journal entry must be an object")
        if type(entry.get("idx")) is not int or entry["idx"] != idx:
            raise InvalidInput("Journal indices are not contiguous")
        when = positive_integer(entry.get("when"), "journal when")
        if when <= previous or entry.get("tag") in tags or not isinstance(entry.get("tag"), str):
            raise InvalidInput("Journal order or tags are invalid")
        if not isinstance(entry.get("sha256"), str) or not HEX.fullmatch(entry["sha256"]):
            raise InvalidInput("Invalid journal hash")
        previous = when
        tags.add(entry["tag"])
    if canonical_hash(journal) != baseline["currentJournal"]["canonicalEntriesSha256"]:
        raise InvalidInput("Journal fingerprint mismatch")
    if rows[-1]["created_at"] != journal[104]["when"]:
        raise InvalidInput("Observed cutoff is not 0104")
    exact = exact_current_prefix(rows, journal)
    if (exact["hashMismatchIdxs"] != [4, 5, 6, 7, 10, 46, 51, 52, 74, 77]
            or len(exact["additionalRows"]) != 1 or exact["missingPrefixIdxs"]):
        raise InvalidInput("Historical diagnostics differ from preserved evidence")
    return rows, journal


def exact_current_prefix(rows, journal):
    duplicates = duplicate_diagnostics(rows)
    expected = {entry["when"]: entry for entry in journal}
    max_when = max((row["created_at"] for row in rows), default=0)
    seen = {row["created_at"] for row in rows}
    mismatches = sorted({expected[row["created_at"]]["idx"] for row in rows
                         if row["created_at"] in expected
                         and row["hash"] != expected[row["created_at"]]["sha256"]})
    additional = [row for row in rows if row["created_at"] not in expected]
    missing = [entry["idx"] for entry in journal
               if entry["when"] <= max_when and entry["when"] not in seen]
    matches = bool(rows) and not (duplicates or mismatches or additional or missing)
    return {"status": "EXACT_CURRENT_PREFIX_MATCH" if matches else "EXACT_CURRENT_PREFIX_MISMATCH",
            "matches": matches, "hashMismatchIdxs": mismatches,
            "additionalRows": additional, "missingPrefixIdxs": missing,
            "duplicates": duplicates,
            "doesNotAuthorizeActivation": True}


def compare_snapshot(baseline, snapshot, *, expected_stage):
    if expected_stage not in STAGES:
        raise InvalidInput("Unknown expected stage")
    expected_rows, journal = validate_baseline(baseline)
    actual = rows_from(snapshot)
    issues = duplicate_diagnostics(actual)
    by_id = {row["id"]: row for row in actual}
    expected_by_id = {row["id"]: row for row in expected_rows}
    for row in expected_rows:
        found = by_id.get(row["id"])
        if found is None:
            issues.append({"kind": "REMOVED_BASELINE_ROW", "expected": row})
        elif found != row:
            issues.append({"kind": "CHANGED_BASELINE_ROW", "expected": row, "actual": found})
    added = [row for row in actual if row["id"] not in expected_by_id]
    allowed = {(entry["when"], entry["sha256"]): entry for entry in journal[105:]}
    observed_stage_idxs = []
    for row in added:
        entry = allowed.get((row["created_at"], row["hash"]))
        if entry is None:
            issues.append({"kind": "UNEXPECTED_ADDED_ROW", "actual": row})
        else:
            observed_stage_idxs.append(entry["idx"])
            # Sequence gaps are allowed; reusing an earlier gap is not this observed append contract.
            if row["id"] <= max(expected_by_id):
                issues.append({"kind": "NONAPPEND_STAGE_ROW_ID", "actual": row})
    recognized_stage = None
    base_intact = not issues
    for name, count in STAGES.items():
        if base_intact and sorted(observed_stage_idxs) == list(range(105, 105 + count)) and len(added) == count:
            recognized_stage = name
    if recognized_stage is None and base_intact:
        issues.append({"kind": "NONCONTIGUOUS_OR_UNEXPECTED_STAGE_SEQUENCE",
                       "observedMigrationIdxs": sorted(observed_stage_idxs)})
    if recognized_stage is not None and recognized_stage != expected_stage:
        issues.append({"kind": "UNEXPECTED_CHECKPOINT", "expectedStage": expected_stage,
                       "recognizedStage": recognized_stage})
    matches = not issues and recognized_stage == expected_stage
    status = "UNEXPECTED_LEDGER_DELTA"
    if matches:
        status = "OBSERVED_HISTORY_MATCH" if expected_stage == "baseline" else "OBSERVED_HISTORY_WITH_EXACT_STAGE_DELTAS"
    exact = exact_current_prefix(actual, journal)
    return {"status": status, "matchesRequestedSnapshot": matches,
            "baselineApprovalStatus": "NOT_APPROVED", "activationAuthorized": False,
            "sourceCommit": baseline["sourceBinding"]["candidateSourceCommit"],
            "expectedStage": expected_stage, "recognizedStage": recognized_stage,
            "observedRowCount": len(actual), "observedRowsSha256": canonical_hash(actual),
            "expectedRowCount": 106 + STAGES[expected_stage],
            "recognizedAppends": added if recognized_stage is not None else [],
            "unexpectedDeltas": issues, "exactCurrentPrefix": exact,
            "nextUnappliedStageIdxs": list(range(105 + STAGES[recognized_stage], 108)) if recognized_stage else None,
            "limits": ["Offline evidence comparison, not a fresh database observation",
                       "Does not verify target identity, exclusivity, objects, deployment or drain",
                       "Exit zero means only the supplied snapshot matches the requested unapproved checkpoint"]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True, type=Path)
    parser.add_argument("--baseline-sha256", required=True,
                        help="Externally reviewed/pinned full artifact hash; not calculated automatically")
    parser.add_argument("--ledger", required=True, type=Path, help="Saved SELECT rows JSON; no network connection")
    parser.add_argument("--expect-stage", required=True, choices=STAGES)
    args = parser.parse_args(argv)
    try:
        if not HEX.fullmatch(args.baseline_sha256):
            raise InvalidInput("Invalid pinned artifact SHA-256")
        baseline_bytes = args.baseline.read_bytes()
        actual_hash = hashlib.sha256(baseline_bytes).hexdigest()
        if actual_hash != args.baseline_sha256:
            raise InvalidInput("Baseline artifact differs from externally pinned SHA-256")
        pinned_baseline = json.loads(baseline_bytes.decode("utf-8"), object_pairs_hook=unique_object)
        result = compare_snapshot(pinned_baseline, read_json(args.ledger), expected_stage=args.expect_stage)
        result["baselineArtifactSha256"] = actual_hash
    except (InvalidInput, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"status": "INVALID_INPUT", "activationAuthorized": False,
                          "error": str(error)}, sort_keys=True))
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["matchesRequestedSnapshot"] else 1


if __name__ == "__main__":
    sys.exit(main())
