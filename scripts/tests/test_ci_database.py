"""Guardas que permiten quitar el reset sin aceptar una base restaurada o incompleta."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import unittest
import tomllib

spec = spec_from_file_location("ci_database", Path(__file__).parents[1] / "ci_database.py")
ci = module_from_spec(spec)
spec.loader.exec_module(ci)


class LocalCiDatabaseTests(unittest.TestCase):
    def test_remote_and_non_ci_destinations_are_rejected(self):
        for env in ({}, {"DB_URL": ci.LOCAL_DB_URL},
                    {"GITHUB_ACTIONS": "true", "DB_URL": "postgresql://remote/postgres"}):
            with self.subTest(env=env), self.assertRaises(ValueError):
                ci.require_local_ci(env)
        ci.require_local_ci({"GITHUB_ACTIONS": "true", "DB_URL": ci.LOCAL_DB_URL})

    def test_empty_runner_is_required_without_deleting_anything(self):
        ci.assert_pristine("local", ["other_volume"], ["unrelated"])
        for volumes, containers in [
            (["supabase_db_local"], []), ([], ["supabase_auth_local"]),
            ([], ["supabase_db_local"]),
        ]:
            with self.subTest(volumes=volumes, containers=containers), self.assertRaises(ValueError):
                ci.assert_pristine("local", volumes, containers)

    def test_seed_is_disabled_without_changing_other_settings(self):
        for content in [
            'project_id = "local"\n[auth]\nenabled = true\n',
            'project_id = "local"\n[db.seed]\nenabled = true\nsql_paths = ["./seed.sql"]\n',
            'project_id = "local"\n[db.seed]\nsql_paths = ["./seed.sql"]\n[auth]\nenabled = true\n',
        ]:
            with self.subTest(content=content):
                before = tomllib.loads(content)
                result = ci.disable_seed(content)
                after = tomllib.loads(result)
                self.assertFalse(after["db"]["seed"]["enabled"])
                self.assertEqual(after.get("auth"), before.get("auth"))
                self.assertEqual(after["db"]["seed"].get("sql_paths"),
                                 before.get("db", {}).get("seed", {}).get("sql_paths"))
                self.assertEqual(ci.disable_seed(result), result)

    def test_unrecognized_seed_format_fails_closed(self):
        with self.assertRaises(ValueError):
            ci.disable_seed('project_id = "local"\n[db]\nseed = { enabled = true }\n')

    def test_migrations_are_compared_by_version_not_only_count(self):
        ci.verify_versions(["001_first.sql", "002_next.sql"], ["002", "001"])
        for applied in [[], ["001"], ["001", "003"], ["001", "002", "003"], ["001", "001"]]:
            with self.subTest(applied=applied), self.assertRaises(ValueError):
                ci.verify_versions(["001_first.sql", "002_next.sql"], applied)

    def test_empty_duplicate_and_malformed_histories_are_rejected(self):
        for files in [[], ["001_first.sql", "001_again.sql"], ["bad.sql"]]:
            with self.subTest(files=files), self.assertRaises(ValueError):
                ci.verify_versions(files, ["001"])


if __name__ == "__main__":
    unittest.main()
