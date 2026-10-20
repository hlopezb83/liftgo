#!/usr/bin/env python3
"""Independent, local-only comparator regression checks. No DB or network use."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
PINNED_BASELINE_SHA256 = "8d8a0ba626c93bd9686d2f666d4ab99ffea7ce8beb097aba1741b1a670b05242"


def main():
    spec = importlib.util.spec_from_file_location("reviewed_comparator", ROOT / "compare_ledger.py")
    comparator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(comparator)
    baseline_bytes = (ROOT / "historical-baseline.review.json").read_bytes()
    assert hashlib.sha256(baseline_bytes).hexdigest() == PINNED_BASELINE_SHA256
    baseline = comparator.read_json(ROOT / "historical-baseline.review.json")
    rows = comparator.rows_from(comparator.read_json(ROOT / "preserved-ledger.snapshot.json"))
    journal = baseline["currentJournal"]["entries"]
    max_id = max(row["id"] for row in rows)
    checks = 0

    def compare(snapshot, stage="baseline"):
        return comparator.compare_snapshot(baseline, snapshot, expected_stage=stage)

    for stage, count in comparator.STAGES.items():
        snapshot = copy.deepcopy(rows) + [
            {"id": max_id + 3 * (k + 1), "created_at": entry["when"], "hash": entry["sha256"]}
            for k, entry in enumerate(journal[105:105 + count])
        ]
        result = compare(snapshot, stage)
        assert result["matchesRequestedSnapshot"]
        assert result["activationAuthorized"] is False
        assert result["baselineApprovalStatus"] == "NOT_APPROVED"
        assert result["exactCurrentPrefix"]["matches"] is False
        checks += 1
        for other in comparator.STAGES:
            if other != stage:
                assert not compare(snapshot, other)["matchesRequestedSnapshot"]
                checks += 1

    for index in range(len(rows)):
        for field, value in [
            ("id", rows[index]["id"] + 100000),
            ("created_at", rows[index]["created_at"] + 1),
            ("hash", "d" * 64),
        ]:
            snapshot = copy.deepcopy(rows)
            snapshot[index][field] = value
            assert not compare(snapshot)["matchesRequestedSnapshot"]
            checks += 1
        assert not compare(rows[:index] + rows[index + 1:])["matchesRequestedSnapshot"]
        checks += 1
        assert not compare(rows + [rows[index]])["matchesRequestedSnapshot"]
        checks += 1

    for indexes in ([106], [107], [105, 107], [106, 107], [105, 105], [105, 106, 106]):
        snapshot = copy.deepcopy(rows) + [
            {"id": max_id + 30 + k, "created_at": journal[index]["when"],
             "hash": journal[index]["sha256"]}
            for k, index in enumerate(indexes)
        ]
        for stage in comparator.STAGES:
            assert not compare(snapshot, stage)["matchesRequestedSnapshot"]
            checks += 1

    for entry in journal[105:]:
        for bad_id in [1, max_id, 0, -1, True, 1.0, "01", "+107", 2 ** 63, "9223372036854775808"]:
            snapshot = rows + [{"id": bad_id, "created_at": entry["when"], "hash": entry["sha256"]}]
            try:
                assert not compare(snapshot, "0105")["matchesRequestedSnapshot"]
            except comparator.InvalidInput:
                pass
            checks += 1

    for value in [None, False, True, 0, -1, 1.0, [], {}, "01", "1.0", "+1", " 1", 2 ** 63]:
        for field in ["id", "created_at", "hash"]:
            snapshot = copy.deepcopy(rows)
            snapshot[0][field] = value
            try:
                assert not compare(snapshot)["matchesRequestedSnapshot"]
            except comparator.InvalidInput:
                pass
            checks += 1

    current = [{"id": i + 1, "created_at": entry["when"], "hash": entry["sha256"]}
               for i, entry in enumerate(journal[:105])]
    result = compare(current)
    assert not result["matchesRequestedSnapshot"] and result["exactCurrentPrefix"]["matches"]
    checks += 1

    # If the baseline path were reread after pin verification, this replacement
    # baseline and its corresponding rows would be accepted incorrectly.
    replacement = copy.deepcopy(baseline)
    replacement["observation"]["rows"][0]["id"] = max_id + 100000
    replacement["observation"]["canonicalRowsSha256"] = comparator.canonical_hash(
        comparator.rows_from(replacement["observation"]["rows"]))

    def substituted_read(path):
        return replacement if str(path) == "baseline.json" else replacement["observation"]["rows"]

    stdout = io.StringIO()
    with patch.object(Path, "read_bytes", return_value=baseline_bytes), \
            patch.object(comparator, "read_json", side_effect=substituted_read), \
            contextlib.redirect_stdout(stdout):
        code = comparator.main(["--baseline", "baseline.json", "--baseline-sha256",
                                PINNED_BASELINE_SHA256, "--ledger", "ledger.json",
                                "--expect-stage", "baseline"])
    result = json.loads(stdout.getvalue())
    assert code == 1 and not result["matchesRequestedSnapshot"]
    checks += 1

    for pin, expected_exit in [(PINNED_BASELINE_SHA256, 0), ("0" * 64, 2)]:
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = comparator.main(["--baseline", str(ROOT / "historical-baseline.review.json"),
                                    "--baseline-sha256", pin,
                                    "--ledger", str(ROOT / "preserved-ledger.snapshot.json"),
                                    "--expect-stage", "baseline"])
        result = json.loads(stdout.getvalue())
        assert code == expected_exit and result["activationAuthorized"] is False
        checks += 1

    malformed = []

    def add_malformed(label, path, value):
        changed = copy.deepcopy(baseline)
        target = changed
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
        malformed.append((label, changed))

    for value in [None, False, [], {}, "text", 1]:
        add_malformed("journal entry", ["currentJournal", "entries", 0], value)
    for value in [None, [], {}, True, 1, ""]:
        add_malformed("journal tag", ["currentJournal", "entries", 0, "tag"], value)
    for value in [None, True, 1.0, "1", 2]:
        add_malformed("schema", ["schemaVersion"], value)
    for value in [None, 0, 1, "false", True]:
        add_malformed("activation", ["activationAuthorized"], value)
    for value in [None, "APPROVED", "NOT_APPROVED"]:
        add_malformed("status", ["status"], value)
    for label, changed in malformed:
        raw = json.dumps(changed).encode()
        stdout = io.StringIO()
        with patch.object(Path, "read_bytes", return_value=raw), \
                patch.object(comparator, "read_json", return_value=baseline["observation"]["rows"]), \
                contextlib.redirect_stdout(stdout):
            code = comparator.main(["--baseline", "baseline.json", "--baseline-sha256",
                                    hashlib.sha256(raw).hexdigest(), "--ledger", "ledger.json",
                                    "--expect-stage", "baseline"])
        result = json.loads(stdout.getvalue())
        assert code == 2 and result["status"] == "INVALID_INPUT", label
        assert result["activationAuthorized"] is False, label
        checks += 1

    assert checks == 668
    print(json.dumps({"independentChecksPassed": checks,
                      "baselineArtifactSha256": PINNED_BASELINE_SHA256,
                      "comparatorSha256": hashlib.sha256((ROOT / "compare_ledger.py").read_bytes()).hexdigest(),
                      "baselineMaxId": max_id,
                      "activationAuthorized": False}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
