## Plan

### Problem
`.github/workflows/changelog-check.yml` line 50 triggers shellcheck **SC2055** because the condition uses `||` to compare the same variable (`$PKG`) against two different values with `!=`:

```bash
if [[ "$PKG" != "$VER" || "$PKG" != "$TOP" ]]; then
```

Shellcheck warns this is suspicious/always-true in some cases and suggests `&&`.

### Fix
Rewrite the condition using equality checks with `&&` inside `[[ ]]`, preserving the exact intent (fail if any version diverges):

```bash
if ! [[ "$PKG" == "$VER" && "$PKG" == "$TOP" ]]; then
  echo "::error::Versiones desincronizadas. Ejecuta \`node scripts/gen-version.mjs\` y verifica que la entrada superior del changelog coincida con package.json."
  exit 1
fi
```

This is logically equivalent to the original but avoids the SC2055 pattern.

### Verification
- Confirm the workflow still blocks PRs when versions are out of sync.
- Optionally run `actionlint` or `shellcheck` on the updated file to confirm the warning disappears.

### Files to modify
- `.github/workflows/changelog-check.yml`