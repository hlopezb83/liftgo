# Guardrails de arquitectura — LiftGo

Documento vinculante. Los checks descritos aquí se ejecutan en CI (job
`arch-check`, además de `lint` + `typecheck` + `knip`) y bloquean el merge.

## Capas y direcciones permitidas

```text
pages/  ──▶  hooks/  ──▶  lib/  ──▶  integrations/supabase/client
components/  ──▶  hooks/                    (nunca al revés)
```

- **pages/ y components/**: NUNCA importan `@/integrations/supabase/client`
  directamente. Única excepción: `src/features/auth/pages/AuthPage.tsx`
  (login pre-sesión).
- **hooks/**: encapsulan toda la I/O (Supabase, edge functions, fetch).
- **lib/**: puro (schemas, formatters, cálculos). No importa React ni Supabase.
- **features/*/pages/**: composición fina. No implementa lógica de negocio.

## Reglas de import cross-feature

- Cada feature expone su API pública vía `src/features/<feature>/index.ts`.
- Otras features SOLO deben importar del barrel público, no rutas internas.
- ESLint: `no-restricted-imports` (nivel `warn` bajo `hooks/` y `lib/`).
- Baseline v7.177.0: 12 imports profundos cross-feature (documentados como
  deuda técnica). Umbral duro del script `arch:check`: 20.

## Prohibiciones absolutas (bloquean CI)

| # | Regla | Enforce |
| - | ----- | ------- |
| G1 | Prohibido re-introducir `src/features/*/api/` — consolidado en `hooks/` (v7.177.0). | `scripts/arch-check.sh` |
| G2 | `src/lib/domain/` congelado. Nuevos archivos deben nacer en `features/*/lib/`. | Allowlist en `scripts/arch-check.sh` |
| G3 | Prohibido crear `src/api/` en la raíz. | `scripts/arch-check.sh` |
| G4 | Supabase en `features/*/pages|components/` (excepto auth). | ESLint + `arch:check` |
| G5 | `lucide-react`, `sonner`, `date-fns/format`, `useNavigate` crudo, paleta Tailwind cruda. | ESLint (`error` o `warn` según tabla en `eslint.config.js`). |

## Rules ESLint activas (matriz)

Ver `eslint.config.js`. Resumen:

| Regla | Alcance | Nivel |
| ----- | ------- | ----- |
| `no-restricted-imports` @ supabase client | `pages/`, `components/` | error |
| `no-restricted-imports` @ lucide-react | todo `src/` excepto `components/icons/**` | error |
| `no-restricted-imports` @ sonner | todo `src/` | error |
| `no-restricted-imports` cross-feature | `hooks/`, `lib/` | warn |
| `no-restricted-imports` @ date-fns/format | `features/`, `components/` | warn |
| `no-restricted-imports` @ useNavigate | todo `src/` excepto auth y el hook | warn |
| `no-restricted-syntax` paleta Tailwind cruda | todo `src/` | warn |
| `no-restricted-syntax` aritmética monetaria | `LineHelpers.ts`, `invoiceForm/**` | error |
| `@typescript-eslint/no-explicit-any` | app (no tests) | error |
| `@typescript-eslint/no-non-null-assertion` | app (no tests) | error |
| `react-hooks/exhaustive-deps` | app | error |
| `max-lines` | 300 líneas | warn |
| `max-lines-per-function` | 150 líneas | warn |
| `complexity` | 15 | warn |

## Cómo correr localmente

```sh
bun run lint          # ESLint
bun run typecheck     # TS
bun run arch:check    # G1–G5 (rg-based, <1s)
bun run knip          # dead exports/deps
bun run test          # Vitest
```

## Cómo evolucionar los guardrails

1. Baja del baseline (menos deuda) → actualizar umbral en `scripts/arch-check.sh`.
2. Cambio estructural intencional (ej. añadir capa) → PR que actualice ESTE
   documento + `eslint.config.js` + `scripts/arch-check.sh` en el mismo commit.
3. Sube del baseline (más deuda) → prohibido salvo justificación explícita en
   el PR body citando este documento.
