## Contexto

CI falló únicamente en el step **Knip (archivos y dependencias sin uso)** con:

```
Unused exports (1)
src/features/audit/hooks/useAuditLogs.ts: useDeleteAuditLog
```

Los demás steps (E2E shard 1: 35 passed / 9 skipped / 0 failed; shard 2, Vitest, RLS, Typecheck, Build, ESLint, Actionlint, Arch, Secrets, Edge smoke) pasaron. El wrapper "CI success" solo reporta rojo porque Knip salió con exit 1.

## Causa

En R14-G removimos la acción **Eliminar** de la bitácora (append-only). El hook `useDeleteAuditLog` quedó exportado sin consumidores — Knip lo detecta como export muerto.

## Fix (v7.229.1 · patch)

1. `src/features/audit/hooks/useAuditLogs.ts`: eliminar la función `useDeleteAuditLog` (10 líneas). Nadie la importa (`rg` confirma cero usos fuera de la declaración).
2. Bump `package.json` a `7.229.1`.
3. Agregar entrada en `public/changelog.json` (index) y `public/changelog/v7.229.1.json` (detalle): "Elimina export muerto `useDeleteAuditLog` que rompía `knip` en CI".

## Validación

- `bunx knip --include exports,types --reporter compact` → 0 unused exports.
- `bunx tsgo --noEmit` → sin errores (el hook no se referencia en ningún archivo).
