#!/usr/bin/env python3
"""Preparar y verificar una base local NUEVA de GitHub Actions, sin reset duplicado."""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import tomllib

LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
CONFIG = Path("supabase/config.toml")
BACKUP = Path("supabase/config.toml.ci-runtime-backup")
DB_IMAGE = "public.ecr.aws/supabase/postgres:17.4.1.068"
DB_DATA_DIRECTORY = "/var/lib/postgresql/data"
CONTAINER_VIEW = '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},"image_id":{{json .Image}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"compose_project":{{json (index .Config.Labels "com.docker.compose.project")}},"running":{{json .State.Running}},"created":{{json .Created}},"ports":{{json (index .NetworkSettings.Ports "5432/tcp")}}}'
IMAGE_VIEW = '{"id":{{json .Id}},"tags":{{json .RepoTags}},"os":{{json .Os}},"architecture":{{json .Architecture}}}'
START_EXCLUDES = {
    "rls": "studio,imgproxy,logflare,vector,edge-runtime,realtime,storage-api,mailpit,postgres-meta,supavisor,kong,postgrest",
    "ab": "studio,imgproxy,logflare,vector,edge-runtime,realtime,mailpit,postgres-meta,supavisor",
}
# Reviewed canonical trees at b7620439; new history requires explicit review.
SOURCE_TREES = {
    "supabase/migrations": "3e3575f5ff6d509ecdd624ae7fc1772508b5dce6",
    "drizzle/migrations": "b7423e31d5fe6b6c3602a815440ba275f6086edc",
}
HTTP_SOURCES = {
    "20260721000000_retry_queue_cron.sql": "2aecccd0758961f41769d9fed522d03df14937650b9dde80fce47646a1fa6887",
    "20260721021751_ee302549-17c5-4ba0-a3f6-2fd8205864d7.sql": "1aa07e7921f9c2a3fed78c79f25135d9a90ca61881bdf086f4fc9ae32895ded9",
    "20260723204610_1fe64056-80bf-40c9-abdc-d48e3f5ed5c3.sql": "bf4d8fcb8b74c18b13b95e299023b442ac9ba6f74c6874caa91bbd8e423b78bf",
    "20260831203519_bb578f8c-da6a-431a-ae66-437908ec41e5.sql": "8dab41eae21b5099fa54ad1a9fe49df74664d21541100e22e875396d7454d30d",
}
# Exact UTF-8/LF output of the pinned legacy patcher, not an alternative source
# allowlist. It wraps four internal_get_cron_secret and two upsert_billing_secret
# GRANT/REVOKE statements; all four stored HTTP command literals stay unchanged.
PATCHED_HTTP_SOURCES = {
    **HTTP_SOURCES,
    "20260721021751_ee302549-17c5-4ba0-a3f6-2fd8205864d7.sql": "ebf3f6c961a03dcb0d6b73999520bfe782f7fa5d67aa63ed90c48bcee67e21bb",
    "20260723204610_1fe64056-80bf-40c9-abdc-d48e3f5ed5c3.sql": "3ee6f108313244fbda13b33637e81b71d34b291683f115b1625f042442ee0a9c",
}
CRON_QUERY = """SELECT row_to_json(s) FROM (
 SELECT name,setting,source,sourcefile,pending_restart,context,
 current_setting('data_directory') AS data_directory,
 pg_postmaster_start_time() AT TIME ZONE 'UTC' AS postmaster_started_at
 FROM pg_settings WHERE name='cron.launch_active_jobs') s"""
ADMIN_SQL = {
    "identity": """SELECT row_to_json(s) FROM (
 SELECT current_user AS current_user, session_user AS session_user,
 (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS rolsuper,
 current_database() AS database, current_setting('data_directory') AS data_directory,
 pg_postmaster_start_time() AT TIME ZONE 'UTC' AS postmaster_started_at) s""",
    "cron-off": "ALTER SYSTEM SET cron.launch_active_jobs = 'off'",
    "reload": "SELECT pg_reload_conf()",
    "verify": CRON_QUERY,
}
EMPTY_BOOTSTRAP = """DO $guard$ DECLARE n bigint; BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
   EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations' INTO n;
   IF n <> 0 THEN RAISE EXCEPTION 'Application history ran during bootstrap'; END IF;
 END IF;
 IF to_regclass('public.bookings') IS NOT NULL OR to_regclass('public.invoices') IS NOT NULL THEN
   RAISE EXCEPTION 'Application tables exist during bootstrap';
 END IF;
 IF to_regclass('cron.job') IS NOT NULL THEN
   EXECUTE 'SELECT count(*) FROM cron.job' INTO n;
   IF n <> 0 THEN RAISE EXCEPTION 'Bootstrap has pre-existing cron jobs'; END IF;
 END IF;
 IF to_regclass('cron.job_run_details') IS NOT NULL THEN
   EXECUTE $$SELECT count(*) FROM cron.job_run_details WHERE status='running'$$ INTO n;
   IF n <> 0 THEN RAISE EXCEPTION 'Bootstrap has running cron jobs'; END IF;
 END IF;
END; $guard$;"""


def require_local_ci(env: dict[str, str]) -> None:
    if env.get("GITHUB_ACTIONS") != "true" or env.get("DB_URL") != LOCAL_DB_URL:
        raise ValueError("Sólo se permite el Postgres loopback fijo de GitHub Actions")


def disable_seed(content: str) -> str:
    config = tomllib.loads(content)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", config.get("project_id", "")):
        raise ValueError("project_id local inválido")
    if config.get("db", {}).get("seed", {}).get("enabled") is False:
        return content
    lines = content.splitlines(keepends=True)
    header = next((i for i, line in enumerate(lines)
                   if re.fullmatch(r"\s*\[db\.seed\]\s*(?:#.*)?\n?", line)), None)
    if header is None:
        if "seed" in config.get("db", {}):
            raise ValueError("Formato de db.seed no soportado; no se modificó la configuración")
        result = content.rstrip() + "\n\n[db.seed]\nenabled = false\n"
    else:
        end = next((i for i in range(header + 1, len(lines))
                    if re.match(r"\s*\[", lines[i])), len(lines))
        enabled = next((i for i in range(header + 1, end)
                        if re.match(r"\s*enabled\s*=", lines[i])), None)
        if enabled is None:
            lines.insert(header + 1, "enabled = false\n")
        else:
            lines[enabled] = "enabled = false\n"
        result = "".join(lines)
    if tomllib.loads(result)["db"]["seed"]["enabled"] is not False:
        raise ValueError("No se pudo deshabilitar el seed local")
    return result


def assert_pristine(project_id: str, volumes: list[str], containers: list[str]) -> None:
    if f"supabase_db_{project_id}" in volumes or any(
        name.startswith("supabase_") and name.endswith(f"_{project_id}")
        for name in containers
    ):
        raise ValueError("El proyecto local ya tiene datos o contenedores; se exige un runner vacío")


def verify_versions(files: list[str], applied: list[str]) -> None:
    expected = []
    for name in files:
        match = re.fullmatch(r"(\d+)_.+\.sql", name)
        if not match:
            raise ValueError(f"Nombre de migración inválido: {name}")
        expected.append(match[1])
    if not expected or len(expected) != len(set(expected)):
        raise ValueError("El historial está vacío o tiene versiones duplicadas")
    if len(applied) != len(set(applied)) or set(expected) != set(applied):
        missing = sorted(set(expected) - set(applied))
        extra = sorted(set(applied) - set(expected))
        raise ValueError(f"Historial distinto: faltantes={missing}, extras={extra}")


def command_lines(command: list[str], *, env: dict[str, str] | None = None, timeout: float | None = None) -> list[str]:
    result = subprocess.run(command, capture_output=True, text=True, env=env, check=True, timeout=timeout)
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def check_http_sources(root: Path = Path("."), *, after_patching: bool = False) -> None:
    """Bounded source check, not a general SQL parser. Full pins are mandatory."""
    expected = PATCHED_HTTP_SOURCES if after_patching else HTTP_SOURCES
    found = set()
    for directory in SOURCE_TREES:
        for path in (root / directory).glob("*.sql"):
            data = path.read_bytes()
            sql = data.decode("utf-8")
            if path.name in HTTP_SOURCES and directory == "supabase/migrations":
                if hashlib.sha256(data).hexdigest() != expected[path.name]:
                    raise ValueError("Reviewed scheduled HTTP source changed: " + path.name)
                # Only this reviewed inner literal is data for cron, not executable DO code.
                spans = re.findall(r"v_command\s*:=\s*format\(\s*\$cmd\$(SELECT net\.http_post\(.*?\);)\$cmd\$", sql, re.S)
                if len(spans) != 1 or not re.search(r"PERFORM cron\.schedule\([^;]*v_command\)", sql):
                    raise ValueError("Unknown scheduled HTTP statement: " + path.name)
                sql = sql.replace(spans[0], "")
                found.add(path.name)
            # Hash-pinned files plus pinned canonical trees establish provenance;
            # these patterns reject additional calls/configuration after the legacy patcher.
            code = re.sub(r"--[^\n]*|/\*.*?\*/", "", sql, flags=re.S)
            if re.search(r"\bnet\s*\.\s*\w+\s*\(|\bhttp(?:_\w+)?\s*\(", code, re.I):
                raise ValueError("Direct or unknown HTTP SQL: " + path.name)
            if re.search(r"cron\s*\.\s*launch_active_jobs|(?:ALTER|DROP)\s+EXTENSION\b[^;]*(?:pg_cron|pg_net)", code, re.I):
                raise ValueError("Unknown scheduler configuration: " + path.name)
    if found != set(HTTP_SOURCES):
        raise ValueError("Reviewed scheduled HTTP source inventory differs")


def preflight_sources(root: Path = Path(".")) -> None:
    trees = command_lines(["git", "-C", str(root), "ls-tree", "HEAD", "--", *SOURCE_TREES])
    if {line.split("\t")[1]: line.split()[2] for line in trees} != SOURCE_TREES:
        raise ValueError("Canonical migration trees changed; source review required")
    entries = command_lines(["git", "-C", str(root), "ls-tree", "-r", "HEAD", "--", *SOURCE_TREES])
    expected = {}
    for entry in entries:
        metadata, name = entry.split("\t")
        mode, kind, digest = metadata.split()
        if mode != "100644" or kind != "blob":
            raise ValueError("Unsupported migration source mode")
        expected[name] = digest
    actual = set()
    for directory in SOURCE_TREES:
        base = root / directory
        if base.is_symlink():
            raise ValueError("Migration root is a symlink")
        for path in base.rglob("*"):
            if path.is_symlink():
                raise ValueError("Migration source is a symlink")
            if not path.is_file() and not path.is_dir():
                raise ValueError("Migration source is not a regular file or directory")
            if path.is_file():
                name = path.relative_to(root).as_posix()
                data = path.read_bytes()
                digest = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
                if expected.get(name) != digest:
                    raise ValueError("Canonical source bytes changed: " + name)
                actual.add(name)
    if actual != set(expected):
        raise ValueError("Canonical source inventory differs")
    patcher = root / "scripts/patch_legacy_migrations.py"
    data = patcher.read_bytes()
    if patcher.is_symlink() or hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() != "85fb78438f26e4745e227fd6e430f8e92034202f":
        raise ValueError("Legacy migration transformer changed")
    check_http_sources(root)


def bootstrap_config(replay: bytes) -> bytes:
    # CLI v2.34.0 internal/migration/apply/apply.go checks these two flags.
    text = replay.decode("utf-8")
    config = tomllib.loads(text)
    if config.get("db", {}).get("port", 54322) != 54322:
        raise ValueError("Local Supabase db.port must match the fixed loopback SQL destination")
    if config.get("db", {}).get("seed", {}).get("enabled") is not False:
        raise ValueError("Exact seed-disabled replay config required")
    if config.get("db", {}).get("migrations", {}).get("enabled", True) is not True:
        raise ValueError("Replay migrations must be enabled")
    lines = text.splitlines(keepends=True)
    header = next((i for i, line in enumerate(lines) if re.fullmatch(r"\s*\[db\.migrations\]\s*(?:#.*)?\n?", line)), None)
    if header is None:
        if "migrations" in config.get("db", {}):
            raise ValueError("Unsupported db.migrations format")
        text = text.rstrip() + "\n\n[db.migrations]\nenabled = false\n"
    else:
        end = next((i for i in range(header + 1, len(lines)) if re.match(r"\s*\[", lines[i])), len(lines))
        enabled = next((i for i in range(header + 1, end) if re.match(r"\s*enabled\s*=", lines[i])), None)
        if enabled is None:
            lines.insert(header + 1, "enabled = false\n")
        else:
            lines[enabled] = "enabled = false\n"
        text = "".join(lines)
    result = tomllib.loads(text)
    if result["db"]["seed"]["enabled"] is not False or result["db"]["migrations"]["enabled"] is not False:
        raise ValueError("Bootstrap config did not disable history and seed")
    return text.encode("utf-8")


def psql(sql: str) -> list[str]:
    return command_lines(["psql", LOCAL_DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", sql], timeout=15)


def json_object(rows: list[str]) -> dict:
    if len(rows) != 1 or not isinstance(value := json.loads(rows[0]), dict):
        raise ValueError("Expected one JSON identity object")
    return value


def owned_db_container(project_id: str, started_at: float) -> str:
    if not isinstance(project_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", project_id):
        raise ValueError("Invalid local project identity")
    name = "supabase_db_" + project_id
    row = json_object(command_lines(["docker", "inspect", "--type", "container", "--format", CONTAINER_VIEW, name], timeout=15))
    if not isinstance(row.get("created"), str):
        raise ValueError("Missing database container creation time")
    created = datetime.fromisoformat(row["created"].replace("Z", "+00:00"))
    ports = row.get("ports")
    if (not isinstance(row.get("id"), str) or not re.fullmatch(r"[a-f0-9]{64}", row["id"])
            or row.get("name") != "/" + name or row.get("project") != project_id or row.get("compose_project") != project_id
            or row.get("running") is not True or row.get("image") != DB_IMAGE
            or not isinstance(row.get("image_id"), str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", row["image_id"])
            or created.tzinfo is None or not started_at <= created.timestamp() <= time.time()
            or not isinstance(ports, list) or not any(
                isinstance(port, dict) and port.get("HostIp") in ("127.0.0.1", "0.0.0.0") and port.get("HostPort") == "54322"
                for port in ports)):
        raise ValueError("Database container ownership, image, freshness or local port differs")
    image = json_object(command_lines(["docker", "image", "inspect", "--format", IMAGE_VIEW, row["image_id"]], timeout=15))
    if (image.get("id") != row["image_id"] or not isinstance(image.get("tags"), list) or DB_IMAGE not in image["tags"]
            or image.get("os") != "linux" or image.get("architecture") != "amd64"):
        raise ValueError("Database image identity differs")
    return row["id"]


def admin_cron_command(container_id: str, operation: str) -> list[str]:
    """Only four fixed cron bootstrap operations; no privileged SQL argument."""
    if not isinstance(container_id, str) or not re.fullmatch(r"[a-f0-9]{64}", container_id) or operation not in ADMIN_SQL:
        raise ValueError("Unknown administrator cron operation or container ID")
    return command_lines([
        "docker", "exec", container_id, "psql", "-h127.0.0.1", "-p5432", "-U", "supabase_admin",
        "-dpostgres", "-X", "-w", "-vON_ERROR_STOP=1", "-Atc", ADMIN_SQL[operation],
    ], timeout=15)


def cron_setting() -> dict:
    rows = psql(CRON_QUERY)
    if len(rows) != 1:
        raise ValueError("Image does not expose cron.launch_active_jobs")
    row = json.loads(rows[0])
    if not isinstance(row, dict) or row.get("name") != "cron.launch_active_jobs" or row.get("context") != "sighup" or type(row.get("pending_restart")) is not bool:
        raise ValueError("Unsupported effective pg_cron GUC")
    return row


def assert_cron_off(row: dict, *, identity: dict | None = None) -> None:
    directory = row.get("data_directory")
    if row.get("setting") != "off" or row.get("source") != "configuration file" or row.get("pending_restart") is not False or row.get("context") != "sighup" or not isinstance(directory, str) or not directory.startswith("/") or any(part in ("", ".", "..") for part in directory.split("/")[1:]) or row.get("sourcefile") != directory + "/postgresql.auto.conf":
        raise ValueError("cron.launch_active_jobs is not effectively OFF from ALTER SYSTEM")
    if identity is not None and any(row.get(key) != identity[key] for key in ("data_directory", "postmaster_started_at")):
        raise ValueError("Cron verification changed database identity")


def publish_backup(temporary: Path, path: Path) -> None:
    if os.name == "nt":
        os.rename(temporary, path)  # Windows rename refuses an existing target.
    else:
        os.link(temporary, path)  # POSIX link publishes without overwriting.


def write_atomic(path: Path, content: bytes, *, exclusive: bool = False) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".ci-db-", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        if exclusive:
            publish_backup(temporary, path)
        else:
            os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def restore_config(config: Path = CONFIG, backup: Path = BACKUP, *, keep_backup: bool = False) -> None:
    if backup.is_symlink() or config.is_symlink():
        raise ValueError("Refusing symlink config recovery")
    if backup.exists():
        replay = backup.read_bytes()
        if config.read_bytes() not in (replay, bootstrap_config(replay)):
            raise ValueError("Backup does not match the current replay/bootstrap config state")
        if keep_backup:
            write_atomic(config, replay)
        else:
            os.replace(backup, config)


def start_guarded(profile: str, config: Path = CONFIG, backup: Path = BACKUP) -> None:
    if profile not in START_EXCLUDES or config.is_symlink() or backup.exists() or backup.is_symlink():
        raise ValueError("Invalid bootstrap profile or stale config backup")
    check_http_sources(after_patching=True)
    replay = config.read_bytes()
    temporary = bootstrap_config(replay)
    write_atomic(backup, replay, exclusive=True)
    try:
        write_atomic(config, temporary)
        started_at = time.time()
        subprocess.run(["supabase", "start", "-x", START_EXCLUDES[profile]], check=True, timeout=840)
        psql(EMPTY_BOOTSTRAP)
        initial = cron_setting()  # Reject missing/unsupported GUC before the administrator operation.
        container_id = owned_db_container(tomllib.loads(replay.decode("utf-8"))["project_id"], started_at)
        identity = json_object(admin_cron_command(container_id, "identity"))
        if (identity.get("current_user") != "supabase_admin" or identity.get("session_user") != "supabase_admin"
                or identity.get("rolsuper") is not True or identity.get("database") != "postgres"
                or identity.get("data_directory") != DB_DATA_DIRECTORY or identity.get("data_directory") != initial.get("data_directory")
                or not isinstance(initial.get("postmaster_started_at"), str) or not initial["postmaster_started_at"]
                or identity.get("postmaster_started_at") != initial["postmaster_started_at"]):
            raise ValueError("Existing administrator identity does not match the local bootstrap database")
        admin_cron_command(container_id, "cron-off")  # Separate command, never a transaction.
        if admin_cron_command(container_id, "reload") != ["t"]:
            raise ValueError("PostgreSQL rejected configuration reload")
        consecutive = 0
        for _ in range(30):
            observed = cron_setting()  # Each invocation is a new postgres connection.
            if any(observed.get(key) != identity[key] for key in ("data_directory", "postmaster_started_at")):
                raise ValueError("Cron verification changed database identity")
            try:
                assert_cron_off(observed)
                consecutive += 1
                if consecutive == 2:
                    break
            except ValueError:
                consecutive = 0
            time.sleep(0.2)
        else:
            raise ValueError("Scheduler OFF was not observed after reload")
        observed = json_object(admin_cron_command(container_id, "verify"))
        assert_cron_off(observed, identity=identity)
        restore_config(config, backup, keep_backup=True)
        if config.read_bytes() != replay:
            raise ValueError("Replay config restoration differs")
        subprocess.run(["supabase", "migration", "up", "--local"], check=True, timeout=840)
        assert_cron_off(cron_setting(), identity=identity)
    finally:
        restore_config(config, backup)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["prepare", "verify", "preflight", "start-guarded", "restore-config", "check-cron-off"])
    parser.add_argument("--profile", choices=START_EXCLUDES)
    args = parser.parse_args()
    try:
        require_local_ci(dict(os.environ))
        if args.operation == "preflight":
            preflight_sources()
            print("Canonical sources and four scheduled HTTP command templates verified")
            return 0
        if args.operation == "start-guarded":
            start_guarded(args.profile)
            return 0
        if args.operation == "restore-config":
            restore_config()
            return 0
        if args.operation == "check-cron-off":
            assert_cron_off(cron_setting())
            return 0
        if args.operation == "prepare":
            config_path = Path("supabase/config.toml")
            content = config_path.read_text(encoding="utf-8")
            project_id = tomllib.loads(content)["project_id"]
            volumes = command_lines(["docker", "volume", "ls", "--format", "{{.Name}}"])
            containers = command_lines(["docker", "ps", "-a", "--format", "{{.Names}}"])
            assert_pristine(project_id, volumes, containers)
            config_path.write_text(disable_seed(content), encoding="utf-8")
            print("Runner vacío verificado; seed deshabilitado sólo en el checkout de CI")
        else:
            files = sorted(path.name for path in Path("supabase/migrations").glob("*.sql"))
            env = dict(os.environ)
            env["PGOPTIONS"] = "-c default_transaction_read_only=on"
            applied = command_lines([
                "psql", LOCAL_DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-Atc",
                "select version from supabase_migrations.schema_migrations order by version",
            ], env=env)
            verify_versions(files, applied)
            assert_cron_off(cron_setting())
            print(f"Migraciones verificadas: {len(applied)}/{len(files)}, versiones exactas")
        return 0
    except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        # Sólo usa credenciales públicas locales; no accede a .env ni a secrets.
        print(f"::error::{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
