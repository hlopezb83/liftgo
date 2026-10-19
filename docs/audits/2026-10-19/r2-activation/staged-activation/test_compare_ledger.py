import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import compare_ledger as checker

ROOT = Path(__file__).resolve().parent
BASELINE_PATH = ROOT / "historical-baseline.review.json"
DEFAULT_ROWS = object()


class LedgerComparisonTests(unittest.TestCase):
    def setUp(self):
        self.baseline = checker.read_json(BASELINE_PATH)
        self.rows = copy.deepcopy(self.baseline["observation"]["rows"])

    def compare(self, rows=DEFAULT_ROWS, stage="baseline"):
        return checker.compare_snapshot(self.baseline, self.rows if rows is DEFAULT_ROWS else rows,
                                        expected_stage=stage)

    def stage_row(self, idx, row_id=None):
        entry = self.baseline["currentJournal"]["entries"][idx]
        return {"id": row_id if row_id is not None else idx + 3,
                "created_at": entry["when"], "hash": entry["sha256"]}

    def assert_rejected(self, rows, stage="baseline", kind=None):
        result = self.compare(rows, stage)
        self.assertFalse(result["matchesRequestedSnapshot"])
        self.assertEqual(result["status"], "UNEXPECTED_LEDGER_DELTA")
        self.assertFalse(result["activationAuthorized"])
        if kind:
            self.assertIn(kind, {d["kind"] for d in result["unexpectedDeltas"]})
        return result

    def test_preserved_baseline_matches_but_is_not_exact_current_prefix(self):
        result = self.compare()
        self.assertEqual(result["status"], "OBSERVED_HISTORY_MATCH")
        self.assertTrue(result["matchesRequestedSnapshot"])
        self.assertEqual(result["baselineApprovalStatus"], "NOT_APPROVED")
        self.assertFalse(result["activationAuthorized"])
        self.assertEqual(result["exactCurrentPrefix"]["status"], "EXACT_CURRENT_PREFIX_MISMATCH")
        self.assertEqual(result["exactCurrentPrefix"]["hashMismatchIdxs"], [4,5,6,7,10,46,51,52,74,77])
        self.assertEqual(len(result["exactCurrentPrefix"]["additionalRows"]), 1)
        self.assertEqual(result["nextUnappliedStageIdxs"], [105,106,107])

    def test_input_order_does_not_change_identity(self):
        result = self.compare(list(reversed(self.rows)))
        self.assertTrue(result["matchesRequestedSnapshot"])
        self.assertEqual(result["observedRowsSha256"], self.baseline["observation"]["canonicalRowsSha256"])

    def test_canonical_bigint_strings_are_exact(self):
        rows = [{**r, "id": str(r["id"]), "created_at": str(r["created_at"])} for r in self.rows]
        self.assertTrue(self.compare({"rows": rows})["matchesRequestedSnapshot"])

    def test_exact_whole_file_stage_prefixes(self):
        for count in (1,2,3):
            with self.subTest(count=count):
                rows = self.rows + [self.stage_row(idx) for idx in range(105,105+count)]
                result = self.compare(rows, f"0{104+count}")
                self.assertTrue(result["matchesRequestedSnapshot"])
                self.assertEqual(result["status"], "OBSERVED_HISTORY_WITH_EXACT_STAGE_DELTAS")
                self.assertEqual(result["observedRowCount"], 106+count)
                self.assertFalse(result["exactCurrentPrefix"]["matches"])
                self.assertFalse(result["activationAuthorized"])

    def test_expected_checkpoint_is_not_automatically_advanced(self):
        result = self.assert_rejected(self.rows+[self.stage_row(105)], kind="UNEXPECTED_CHECKPOINT")
        self.assertEqual(result["recognizedStage"], "0105")

    def test_prior_checkpoint_is_not_claimed_complete(self):
        self.assert_rejected(self.rows, stage="0105", kind="UNEXPECTED_CHECKPOINT")

    def test_future_stage_gap_rejected(self):
        for idxs in ([106],[107],[105,107],[106,107]):
            with self.subTest(idxs=idxs):
                self.assert_rejected(self.rows+[self.stage_row(i) for i in idxs], stage="0107",
                                     kind="NONCONTIGUOUS_OR_UNEXPECTED_STAGE_SEQUENCE")

    def test_new_serial_sequence_gaps_allowed(self):
        rows=self.rows+[self.stage_row(105,120),self.stage_row(106,150),self.stage_row(107,201)]
        self.assertTrue(self.compare(rows,"0107")["matchesRequestedSnapshot"])

    def test_stage_cannot_reuse_old_serial_gap(self):
        used={r["id"] for r in self.rows}
        gap=next(i for i in range(1,max(used)) if i not in used)
        self.assert_rejected(self.rows+[self.stage_row(105,gap)],stage="0105",kind="NONAPPEND_STAGE_ROW_ID")

    def test_unknown_added_row(self):
        self.assert_rejected(self.rows+[{"id":108,"created_at":9999999999999,"hash":"a"*64}],kind="UNEXPECTED_ADDED_ROW")

    def test_removed_row(self):
        self.assert_rejected(self.rows[1:],kind="REMOVED_BASELINE_ROW")

    def test_changed_hash(self):
        self.rows[0]["hash"]="f"*64
        self.assert_rejected(self.rows,kind="CHANGED_BASELINE_ROW")

    def test_changed_timestamp(self):
        self.rows[0]["created_at"]+=1
        self.assert_rejected(self.rows,kind="CHANGED_BASELINE_ROW")

    def test_changed_id(self):
        self.rows[0]["id"]=999
        self.assert_rejected(self.rows,kind="REMOVED_BASELINE_ROW")

    def test_duplicate_exact_row(self):
        self.assert_rejected(self.rows+[self.rows[0]],kind="DUPLICATE_TIMESTAMP_HASH_PAIR")

    def test_duplicate_pair_with_new_id(self):
        self.assert_rejected(self.rows+[{**self.rows[0],"id":999}],kind="DUPLICATE_TIMESTAMP_HASH_PAIR")

    def test_duplicate_timestamp_different_hash(self):
        self.assert_rejected(self.rows+[{**self.rows[0],"id":999,"hash":"f"*64}],kind="DUPLICATE_CREATED_AT")

    def test_duplicate_id_different_pair(self):
        self.assert_rejected(self.rows+[self.stage_row(105,self.rows[0]["id"])],stage="0105",kind="DUPLICATE_ID")

    def test_duplicate_stage_pair(self):
        self.assert_rejected(self.rows+[self.stage_row(105,108),self.stage_row(105,109)],stage="0105",
                             kind="DUPLICATE_TIMESTAMP_HASH_PAIR")

    def test_wrong_stage_hash(self):
        row=self.stage_row(105);row["hash"]="e"*64
        self.assert_rejected(self.rows+[row],stage="0105",kind="UNEXPECTED_ADDED_ROW")

    def test_wrong_stage_timestamp(self):
        row=self.stage_row(105);row["created_at"]+=1
        self.assert_rejected(self.rows+[row],stage="0105",kind="UNEXPECTED_ADDED_ROW")

    def test_hash_normalization_is_not_an_exception(self):
        entry=self.baseline["currentJournal"]["entries"][46]
        next(r for r in self.rows if r["created_at"]==entry["when"])["hash"]=entry["sha256"]
        self.assert_rejected(self.rows,kind="CHANGED_BASELINE_ROW")

    def test_removed_historical_extra_cannot_be_ignored(self):
        self.assert_rejected([r for r in self.rows if r["id"]!=31],kind="REMOVED_BASELINE_ROW")

    def test_0104_is_not_an_exception(self):
        self.rows[-1]["hash"]="0"*64
        self.assert_rejected(self.rows,kind="CHANGED_BASELINE_ROW")

    def test_exact_modern_prefix_is_distinct_and_cannot_replace_history(self):
        rows=[{"id":e["idx"]+1,"created_at":e["when"],"hash":e["sha256"]}
              for e in self.baseline["currentJournal"]["entries"]]
        result=self.assert_rejected(rows,stage="0107")
        self.assertTrue(result["exactCurrentPrefix"]["matches"])
        self.assertFalse(result["activationAuthorized"])

    def test_empty_input_not_a_pass(self):
        result=self.assert_rejected([])
        self.assertFalse(result["exactCurrentPrefix"]["matches"])

    def test_malformed_rows_rejected(self):
        for value in (True,1.0,None,"001","+1","1e2",-1,0):
            with self.subTest(value=value):
                rows=copy.deepcopy(self.rows);rows[0]["created_at"]=value
                with self.assertRaises(checker.InvalidInput):self.compare(rows)
        for row in ({"id":1,"created_at":1}, {**self.rows[0],"extra":1},
                    {**self.rows[0],"hash":"A"*64}, {**self.rows[0],"hash":"abcd"}):
            with self.subTest(row=row):
                with self.assertRaises(checker.InvalidInput):self.compare([row])

    def test_tool_error_is_not_an_empty_ledger(self):
        for value in ({"error_code":"UNAVAILABLE"},{"rows":None},None,"[]",
                      {"rows":self.rows,"isError":True},{"rows":self.rows,"error":"stale result"}):
            with self.subTest(value=value):
                with self.assertRaises(checker.InvalidInput):self.compare(value)

    def test_artifact_cannot_promote_approval(self):
        for key,value in (("status","APPROVED"),("activationAuthorized",True),("schemaVersion",True)):
            original=self.baseline[key];self.baseline[key]=value
            with self.assertRaises(checker.InvalidInput):self.compare()
            self.baseline[key]=original

    def test_internal_row_fingerprint_tamper(self):
        self.baseline["observation"]["rows"][0]["hash"]="f"*64
        with self.assertRaises(checker.InvalidInput):self.compare()

    def test_internal_journal_fingerprint_tamper(self):
        self.baseline["currentJournal"]["entries"][105]["sha256"]="f"*64
        with self.assertRaises(checker.InvalidInput):self.compare()

    def test_null_journal_entry_is_clean_validation_error(self):
        self.baseline["currentJournal"]["entries"][0]=None
        with self.assertRaises(checker.InvalidInput):self.compare()

    def test_duplicate_json_keys_rejected(self):
        with self.assertRaises(checker.InvalidInput):
            json.loads('{"rows":[],"rows":[]}',object_pairs_hook=checker.unique_object)

    def test_cli_pin_and_exit_codes(self):
        pin=hashlib.sha256(BASELINE_PATH.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            ledger=Path(tmp)/"rows.json";ledger.write_text(json.dumps(self.rows))
            args=["--baseline",str(BASELINE_PATH),"--baseline-sha256",pin,"--ledger",str(ledger),"--expect-stage","baseline"]
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(checker.main(args),0)
            self.assertFalse(json.loads(output.getvalue())["activationAuthorized"])
            ledger.write_text(json.dumps(self.rows[:-1]))
            with contextlib.redirect_stdout(io.StringIO()):self.assertEqual(checker.main(args),1)
            args[3]="0"*64
            with contextlib.redirect_stdout(io.StringIO()) as output:self.assertEqual(checker.main(args),2)
            self.assertEqual(json.loads(output.getvalue())["status"],"INVALID_INPUT")

    def test_cli_parses_the_same_bytes_it_hashes(self):
        pin=hashlib.sha256(BASELINE_PATH.read_bytes()).hexdigest()
        args=["--baseline",str(BASELINE_PATH),"--baseline-sha256",pin,"--ledger","snapshot.json","--expect-stage","baseline"]
        # read_json must only be used for the ledger; a second baseline-path read is forbidden.
        with mock.patch.object(checker,"read_json",return_value=self.rows) as read, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(checker.main(args),0)
        read.assert_called_once_with(Path("snapshot.json"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
