"""Two real DB sessions must not remove both remaining roots. CI localhost only."""
from concurrent.futures import ThreadPoolExecutor
import os
import subprocess
from urllib.parse import urlparse

DB_URL = os.environ.get("DB_URL", "")
target = urlparse(DB_URL)
if (os.environ.get("GITHUB_ACTIONS") != "true" or target.hostname != "127.0.0.1"
        or target.port != 54322 or target.path != "/postgres"):
    raise SystemExit("Requires the disposable GitHub Actions database on 127.0.0.1:54322/postgres")

IDS = ["91910000-0000-4000-8000-000000000001", "91910000-0000-4000-8000-000000000002"]
def sql(command):
    return subprocess.run(["psql", DB_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                           "-v", "VERBOSITY=verbose", "-c", command],
                          capture_output=True, text=True, timeout=30)

def checked(command):
    result = sql(command)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

if checked("SELECT count(*) FROM public.platform_operators") != "0":
    raise SystemExit("Concurrency fixture requires an empty operator registry")

try:
    checked("""BEGIN;
      SELECT set_config('app.organization_id',(SELECT id::text FROM public.organizations ORDER BY created_at LIMIT 1),true);
      INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
        ('91910000-0000-4000-8000-000000000001','root-race-1@example.com',now(),now()),
        ('91910000-0000-4000-8000-000000000002','root-race-2@example.com',now(),now());
      INSERT INTO public.profiles(user_id,full_name,is_active) VALUES
        ('91910000-0000-4000-8000-000000000001','CI raíz 1',true),
        ('91910000-0000-4000-8000-000000000002','CI raíz 2',true)
        ON CONFLICT(user_id) DO UPDATE SET is_active=true;
      INSERT INTO public.platform_operators(auth_user_id) VALUES
        ('91910000-0000-4000-8000-000000000001'),('91910000-0000-4000-8000-000000000002');
      COMMIT;""")
    for isolation in ["READ COMMITTED", "REPEATABLE READ"]:
        checked("UPDATE public.platform_operators SET access_profile='root'")
        def remove(identity):
            # Establish snapshots before competing; the first holds the lock
            # until COMMIT. The second must fail closed after waiting.
            return sql(f"""BEGIN ISOLATION LEVEL {isolation};
              SELECT count(*) FROM public.platform_operators;
              SELECT pg_sleep(0.5);
              UPDATE public.platform_operators SET access_profile='observer' WHERE auth_user_id='{identity}';
              SELECT pg_sleep(0.5); COMMIT;""")
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(remove, IDS))
        assert sum(result.returncode == 0 for result in results) == 1, results
        failed = next(result for result in results if result.returncode)
        assert "42501" in failed.stderr or "40001" in failed.stderr, failed.stderr
        assert checked("SELECT count(*) FROM public.platform_operators WHERE access_profile='root'") == "1"
        print(f"PASS: concurrent last-root demotion ({isolation})")
finally:
    # Disposable owner-only cleanup, in one transaction. Never a production
    # path: requires localhost + GITHUB_ACTIONS and an initially empty registry.
    checked("""BEGIN;
      ALTER TABLE public.platform_operators DISABLE TRIGGER platform_operator_root_protection;
      DELETE FROM public.platform_operators WHERE auth_user_id IN
        ('91910000-0000-4000-8000-000000000001','91910000-0000-4000-8000-000000000002');
      ALTER TABLE public.platform_operators ENABLE TRIGGER platform_operator_root_protection;
      DELETE FROM auth.users WHERE id IN
        ('91910000-0000-4000-8000-000000000001','91910000-0000-4000-8000-000000000002');
      COMMIT;""")
