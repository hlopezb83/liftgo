## Auditoría GitHub Actions — segunda pasada (post v6.101.0)

La auditoría anterior (v6.101.0) cerró 4 bloques (seguridad, estabilidad, gates, nice-to-have). Esta segunda pasada revisa lo que quedó fuera y encuentra **5 hallazgos** — todos de bajo riesgo, cero cambios de comportamiento en el happy path.

### Estado actual (resumen)

| Workflow | Trigger | Concurrencia PR/main | Notas |
|---|---|---|---|
| `ci.yml` | PR + push:main | cancel en PR, preservar main | ✅ |
| `codeql.yml` | PR + push:main + cron | cancel en PR, preservar main | ✅ |
| `release-drafter.yml` | push:main + dispatch | `cancel-in-progress: false` fijo | ⚠️ comentario obsoleto |
| `gitleaks.yml` | PR + push:main + cron | `cancel-in-progress: true` fijo | ⚠️ inconsistente |
| `bundle-size.yml` | PR | cancel siempre | ✅ |
| `labeler.yml` | pull_request_target | SHA pineado | ✅ |
| `lighthouse.yml` | cron + dispatch | cancel siempre | ⚠️ sin notificación de fallo |
| `supabase-lint.yml` | PR (paths) | — | ✅ |
| `changelog-check.yml` | PR (paths) | — | ✅ |

### Hallazgos

**H1 — Cache key de bun referencia archivo eliminado**  
`setup-bun-project/action.yml:23` sigue haciendo `hashFiles('**/bun.lockb', '**/bun.lock', '**/package.json')`. `bun.lockb` se eliminó en v6.100.2; el patrón no rompe (glob sin match devuelve empty), pero contamina la key. Simplificar a `hashFiles('**/bun.lock', '**/package.json')`.

**H2 — `gitleaks.yml` con concurrencia inconsistente**  
Usa `cancel-in-progress: true` sin distinguir PR vs push:main. Alinear con la política de `ci.yml`/`codeql.yml`: cancelar solo en PRs para preservar histórico de escaneos de seguridad por SHA en `main`.

**H3 — Comentario obsoleto en `release-drafter.yml`**  
Línea 13: `# Solo cancelamos en PRs; en main preservamos histórico de runs.` — pero el trigger `pull_request` fue removido en v6.101.0. Reemplazar por `# Solo push:main y dispatch; nunca cancelamos porque cada release-note es acumulativa.`.

**H4 — `lighthouse.yml` sin señal de fallo**  
Corre diario 05:00 America/Monterrey contra `https://liftgo.lovable.app`. Si un threshold del `lighthouserc.json` falla, el job queda rojo en Actions pero nadie se entera (no hay PR asociado, no hay email, no hay issue). Agregar step final con `if: failure()` que abra/actualice un issue `[Lighthouse] Regresión de performance` usando `actions/github-script@v7` — patrón estándar, sin dependencias nuevas.

**H5 — Dependabot sin `reviewers`**  
`dependabot.yml` no asigna reviewer, así que los PRs de bumps semanales se acumulan sin que nadie sea notificado explícitamente. Agregar `reviewers: [<github-username>]` en ambos ecosystems (npm + github-actions). Requiere confirmar el username a asignar.

### Plan de aplicación (v6.102.0)

1. **H1** — `.github/actions/setup-bun-project/action.yml` cache key sin `bun.lockb`.
2. **H2** — `.github/workflows/gitleaks.yml` concurrencia condicional.
3. **H3** — `.github/workflows/release-drafter.yml` fix comentario.
4. **H4** — `.github/workflows/lighthouse.yml` step de auto-issue on failure con `actions/github-script` pineado a SHA.
5. **H5** — `.github/dependabot.yml` agregar `reviewers` (necesito username de GitHub para asignar).
6. Entrada `public/changelog.json` + `public/changelog/v6.102.0.json` describiendo cada hallazgo.

### Verificación post-cambio

- `bun scripts/validate-changelog.ts` → OK.
- Revisar `actionlint` local: `bunx --bun @rhysd/actionlint` sobre los 3 workflows modificados.
- No requiere restart del dev server (no toca código de la app).

### Fuera de alcance (revisado y sin acción)

- CodeQL: `github/codeql-action/init@v3` sin SHA — es acción oficial de GitHub, tag flotante es la recomendación de GH.
- `bundle-size.yml`: `fetch-depth: 0` ya está (línea 30), `git worktree add` funciona.
- `ci.yml` `ci-success` gate: cuenta `skipped` como pass a propósito (edge-functions/e2e se saltan sin secrets en forks).
- `actionlint` con `filter_mode: added`: intencional para evitar ruido histórico.

### ¿Confirmas H5?

Para aplicar el bloque completo necesito el **GitHub username** que debe recibir las asignaciones de Dependabot y del issue de Lighthouse (H4). Si prefieres saltar H5 y dejar H4 solo creando el issue sin asignar, también funciona.
