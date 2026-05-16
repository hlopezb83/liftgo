# Arreglar CI rojo (workflow `CI / Lint, Knip, Tests, Build`)

## Diagnóstico

Reproduje los checks localmente:

- **ESLint**: ✅ 0 errores (56 warnings de complejidad preexistentes, no rompen).
- **Knip (files + dependencies + binaries)**: ❌ falla con 1 archivo huérfano.

```
Unused files (1)
src/features/audit/hooks/useActivityFeed.ts
```

Ese archivo es un shim de re-export (`export * from "@/features/dashboard/hooks/useActivityFeed"`) que quedó del refactor anterior. Verifiqué con `rg` que **ningún archivo** lo importa, así que se puede borrar sin tocar nada más.

Las 2 annotations del run de GitHub corresponden a este mismo finding de knip (file + summary).

## Cambios propuestos

1. **Borrar** `src/features/audit/hooks/useActivityFeed.ts`.
2. **Changelog** `v5.88.1` (patch): entrada en `public/changelog.json` + `public/changelog/v5.88.1.json` describiendo el fix de CI.

## Fuera de alcance

- Los 56 warnings de complejidad de ESLint (preexistentes, no bloquean CI).
- Cambios al workflow `.github/workflows/ci.yml` (funciona correctamente; solo está reportando un problema real).
