# Restricted migration role: K1 parameter configuration regression

This is local synthetic PostgreSQL 17.9 evidence for the real CI failure applying
0104 at commit `99901fedd1b83b000e6230c6750ed65576f257df`. It changes no published
database, account, or data. The old and new migration bytes were run in separate
fresh databases on `127.0.0.1:55443`. Both runs stopped the owned cluster with
`pg_ctl stop` exit 0 and `pg_ctl status` exit 3. Nothing was dropped or reset.

`before-0104.sql` preserves the exact LF SQL before this fix, SHA256
`eabf3090ca8a3e7585586ac416f528520b6f4d8d083b57caf84267545ef0b7e1`.
The after input was the root-owned candidate file in `audit-k1-integrated`, SHA256
`1fbcf64ae779070e0900061921661481fe44cb1cd23b6ab70dc322599129c877`.
The test worktree edits no product SQL or client code.

## Exact DDL reproduction

The fixture creates `restricted_migrator` with `NOSUPERUSER NOCREATEDB NOCREATEROLE
NOINHERIT`, grants schema CREATE/USAGE needed for the fresh fixture, and revokes
PUBLIC SET on `app.cxp_rpc`, `app.cxp_recalc`, and `app.audit_revert`. It verifies
all three parameter privileges are false. The same role then runs the entire
migration through psql `--single-transaction`; no SET privilege is granted.

- Before: psql exits 3, SQLSTATE `42501`, `permission denied to set parameter
  "app.cxp_rpc"`, location `validate_option_array_item, guc.c:6767`. The transaction
  leaves the RPC absent. This reproduces the actual parameter names without a
  substitute SUSET parameter, extension, or mock.
- After: psql exits 0; the created function belongs to the restricted migrator,
  remains SECURITY DEFINER, and its only proconfig item is the pinned search path.
- The same three creation checks are 1/3 before and 3/3 after. Five runtime checks
  can run only after the RPC exists; the final after report is 8/8.

## Runtime checks and explicit fixture boundary

The existing supplier-bill fixture uses FORCE RLS and historically executes its
trusted definer functions as local `postgres`. A new role with no BYPASSRLS and no
applicable policies cannot see rows merely because it owns the table. Rather
than granting the restricted role BYPASSRLS, membership, table-wide access, or SET
privileges, the runner **separates DDL authorization from runtime authorization**:
after recording the new function's DDL owner/config, the fresh local fixture
changes only that function's owner to its existing trusted `postgres` owner. This
is a test setup statement, not a proposed production migration or a claim about
the published owner/ACL. Actual activation must use its separately verified role,
ownership, ACL, and RLS contract.

With the same candidate body, the runner sets the caller to `authenticated` and
uses the active synthetic admin's JWT and organization. It verifies:

- A full allowed payload with identical amounts edits only description on an
  approved bill; the stored amounts and protected fields remain unchanged.
- Each inherited `app.cxp_rpc=on`, `app.cxp_recalc=on`, and `app.audit_revert=on`
  returns `42501`; the before/after row images are identical. The fixture owner
  sets the local flag before `SET LOCAL ROLE authenticated`. A caller receives no
  SET privilege.
- The exact existing 30-case legacy/typmod matrix is reused unchanged and passes
  **30/30**, including full identical-value form payloads and raw-number locks.

The initial exploratory harness used the synthetic no-BYPASSRLS owner for runtime
and hit that expected fixture RLS boundary; it also selected a seed with null
required form fields. Those exploratory logs remain in ignored `.local-pg` and
are not counted as product regressions. The final runner keeps the boundary and
valid synthetic payload explicit. No business matrix was expanded.

`before-results.json` and `after-results.json` record exact executed hashes,
SQLSTATEs and synthetic row images. Their logs contain only the local fixture,
with local profile/workspace paths replaced and line padding removed. Input hashes include the actual
checkout line endings for fixture/cases; `before-0104.sql` and the after candidate
are LF and match the reviewed SQL hashes above.

To repeat, use a fresh fixture name (the runner intentionally refuses to recreate
an existing database), set `K1_PG_BIN` to PostgreSQL binaries, and run:

```text
node docs/audits/2026-10-18/supplier-discount-integrated/restricted-migrator/run.mjs before docs/audits/2026-10-18/supplier-discount-integrated/restricted-migrator/before-0104.sql
node docs/audits/2026-10-18/supplier-discount-integrated/restricted-migrator/run.mjs after <exact-reviewed-candidate-path>
```

These psql checks do not replace Drizzle, Supabase CI, the actual activation role,
published API/RLS tests, or coordinator approval. No migration was applied outside
the local disposable fixture.
