#!/usr/bin/env bash
# Isolated test on a throwaway local cluster. Clears PG* env so it can never
# reach the project database. Fictitious data only.
set -euo pipefail
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE DATABASE_URL SUPABASE_DB_URL || true
DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d /tmp/fx6-sqltest.XXXXXX)"
SOCK="$TMP/sock"; mkdir -p "$SOCK"
cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
RUNAS=""; if [ "$(id -u)" = "0" ]; then chown -R 1000 "$TMP"; chmod 755 "$TMP"; RUNAS="setpriv --reuid=1000 --regid=1000 --clear-groups --"; fi
$RUNAS initdb -D "$TMP/data" -U fx6 --auth=trust >/dev/null
$RUNAS pg_ctl -D "$TMP/data" -o "-k $SOCK -c listen_addresses=''" -l "$TMP/log" start >/dev/null
P() { $RUNAS psql -h "$SOCK" -U fx6 -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }
PN() { $RUNAS psql -h "$SOCK" -U fx6 -d neg -v ON_ERROR_STOP=1 -Atq "$@"; }
SBX=sandbox_exec_zxefrzfaynnfwazqhwxp
P <<SQL
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE ROLE $SBX NOLOGIN; CREATE ROLE fx6_extra NOLOGIN;
-- Reproduce the observed default ACL of schema public BEFORE CREATE FUNCTION
ALTER DEFAULT PRIVILEGES FOR ROLE fx6 IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role, $SBX;
CREATE TABLE public.billing_secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, facturapi_test_key text, facturapi_live_key text);
CREATE TABLE public.company_settings (organization_id uuid, facturapi_mode text);
SQL
fails=0
DACL="$(P -c "SELECT array_to_string(defaclacl,',') FROM pg_default_acl WHERE defaclobjtype='f' AND defaclnamespace='public'::regnamespace")"
echo "dacl $DACL"
case "$DACL" in *"$SBX=X/fx6"*service_role*|*service_role*"$SBX=X/fx6"*) echo "ok   default ACL reproducida con rol técnico";; *) echo "FAIL default ACL"; fails=$((fails+1));; esac
# Negative: an unexpected extra grant must abort the whole migration (rollback)
P -c "CREATE DATABASE neg TEMPLATE postgres"
if { echo "ALTER DEFAULT PRIVILEGES FOR ROLE fx6 IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO fx6_extra;"; cat "$DIR/0134_qa_fx6_test_key_exclusive.sql"; } | PN -1 >/dev/null 2>&1; then
  echo "FAIL aserción no abortó con grant extra"; fails=$((fails+1)); else echo "ok   aserción aborta con grant extra"; fi
[ "$(PN -c "SELECT count(*) FROM pg_proc WHERE proname='qa_fx6_elogistix_test_key_is_exclusive'")" = 0 ] && echo "ok   rollback: función no quedó creada" || { echo "FAIL rollback"; fails=$((fails+1)); }
P -1 -f "$DIR/0134_qa_fx6_test_key_exclusive.sql"
T=fc2c10e3-278b-4899-8aa1-f802752f1c38; O=00000000-0000-4000-8000-000000000002
check() { # name expected setup-sql
  local got
  got="$(P -c "BEGIN; $3; SET LOCAL ROLE service_role; SELECT public.qa_fx6_elogistix_test_key_is_exclusive(); ROLLBACK;" | tail -n1)"
  if [ "$got" = "$2" ]; then echo "ok   $1"; else echo "FAIL $1 (got $got)"; fails=$((fails+1)); fi
}
BASE="INSERT INTO company_settings VALUES ('$T','test'); INSERT INTO billing_secrets(organization_id,facturapi_test_key) VALUES ('$T','sk_test_FAKE1')"
check "exclusiva -> true" t "$BASE"
check "otra org misma llave -> false" f "$BASE; INSERT INTO billing_secrets(organization_id,facturapi_test_key) VALUES ('$O','sk_test_FAKE1')"
check "otra org otra llave -> true" t "$BASE; INSERT INTO billing_secrets(organization_id,facturapi_test_key) VALUES ('$O','sk_test_OTHER')"
check "sin fila secreto -> false" f "INSERT INTO company_settings VALUES ('$T','test')"
check "llave nula -> false" f "INSERT INTO company_settings VALUES ('$T','test'); INSERT INTO billing_secrets(organization_id) VALUES ('$T')"
check "llave sk_test_ vacía -> false" f "INSERT INTO company_settings VALUES ('$T','test'); INSERT INTO billing_secrets(organization_id,facturapi_test_key) VALUES ('$T','sk_test_')"
check "llave live en columna test -> false" f "INSERT INTO company_settings VALUES ('$T','test'); INSERT INTO billing_secrets(organization_id,facturapi_test_key) VALUES ('$T','sk_live_FAKE')"
check "fila secreto duplicada -> false" f "$BASE; INSERT INTO billing_secrets(organization_id,facturapi_test_key) VALUES ('$T','sk_test_FAKE2')"
check "settings duplicado -> false" f "$BASE; INSERT INTO company_settings VALUES ('$T','test')"
check "modo live -> false" f "INSERT INTO company_settings VALUES ('$T','live'); INSERT INTO billing_secrets(organization_id,facturapi_test_key) VALUES ('$T','sk_test_FAKE1')"
check "modo nulo -> false" f "INSERT INTO company_settings VALUES ('$T',NULL); INSERT INTO billing_secrets(organization_id,facturapi_test_key) VALUES ('$T','sk_test_FAKE1')"
check "sin settings -> false" f "INSERT INTO billing_secrets(organization_id,facturapi_test_key) VALUES ('$T','sk_test_FAKE1')"
check "sólo otro tenant -> false" f "INSERT INTO company_settings VALUES ('$O','test'); INSERT INTO billing_secrets(organization_id,facturapi_test_key) VALUES ('$O','sk_test_FAKE1')"
check "live igual en otra org no se lee -> true" t "$BASE; INSERT INTO billing_secrets(organization_id,facturapi_live_key) VALUES ('$O','sk_test_FAKE1')"
for r in anon authenticated $SBX fx6_extra; do
  if P -c "SET ROLE $r; SELECT public.qa_fx6_elogistix_test_key_is_exclusive();" >/dev/null 2>&1; then
    echo "FAIL $r puede ejecutar"; fails=$((fails+1)); else echo "ok   $r sin EXECUTE"; fi
done
ACL="$(P -c "SELECT p.prosecdef, p.provolatile, array_to_string(p.proconfig,','), pg_get_function_arguments(p.oid), p.prorettype::regtype,
  (SELECT string_agg(coalesce(nullif(a.grantee::regrole::text,'-'),'PUBLIC')||':'||a.privilege_type, ',' ORDER BY 1)
     FROM aclexplode(p.proacl) a WHERE a.grantee <> p.proowner)
  FROM pg_proc p WHERE p.proname='qa_fx6_elogistix_test_key_is_exclusive'")"
echo "acl  $ACL"
[ "$ACL" = "t|s|search_path=pg_catalog, public||boolean|service_role:EXECUTE" ] || { echo "FAIL atributos/ACL"; fails=$((fails+1)); }
if P -c "SELECT pg_get_functiondef('public.qa_fx6_elogistix_test_key_is_exclusive()'::regprocedure)" | grep -q facturapi_live_key; then
  echo "FAIL lee live"; fails=$((fails+1)); else echo "ok   no lee live"; fi
RAW="$(P -c "SELECT array_to_string(proacl,',') FROM pg_proc WHERE proname='qa_fx6_elogistix_test_key_is_exclusive'")"
echo "raw  $RAW"
[ "$RAW" = "fx6=X/fx6,service_role=X/fx6" ] && echo "ok   ACL exacta owner+service_role sin grant option" || { echo "FAIL ACL exacta"; fails=$((fails+1)); }
P -1 -f "$DIR/recovery_disable_not_executed.sql"
RAW="$(P -c "SELECT array_to_string(proacl,',') FROM pg_proc WHERE proname='qa_fx6_elogistix_test_key_is_exclusive'")"
[ "$RAW" = "fx6=X/fx6" ] && echo "ok   recuperación deja sólo owner" || { echo "FAIL recuperación ACL ($RAW)"; fails=$((fails+1)); }
for r in anon authenticated $SBX; do
  if P -c "SET ROLE $r; SELECT public.qa_fx6_elogistix_test_key_is_exclusive();" >/dev/null 2>&1; then
    echo "FAIL $r ejecuta tras recuperación"; fails=$((fails+1)); else echo "ok   $r denegado tras recuperación"; fi
done
if P -c "SET ROLE service_role; SELECT public.qa_fx6_elogistix_test_key_is_exclusive();" >/dev/null 2>&1; then
  echo "FAIL recuperación"; fails=$((fails+1)); else echo "ok   recuperación quita EXECUTE sin DROP"; fi
echo "fallos: $fails"; [ "$fails" = 0 ]
