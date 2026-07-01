# Auditoría de GitHub Actions

Alcance: 8 workflows en `.github/workflows/` + composite `.github/actions/setup-bun-project/` + `.github/dependabot.yml`. Foco: correctness, seguridad de la cadena de suministro, permisos, reproducibilidad, performance y observabilidad.

## Resumen ejecutivo

Pipeline maduro (paralelización, composite action, gate único, sharding E2E, pineo por SHA en la mayoría de terceros). Riesgos reales acotados a: (1) permisos amplios en `pull_request_target` del labeler, (2) `release-drafter` disparado en `pull_request` desde forks con permisos que el token no tendrá, (3) `concurrency` con `cancel-in-progress: true` en `push: main` que pierde señal histórica, (4) checks textuales de `supabase-lint` con falsos positivos en comentarios, (5) `bun-version: 1.2.x` no reproducible, (6) mezcla de mayor pinning entre workflows.

Estado global: **verde con 3 fixes recomendados y varios nice-to-have**.

---

## Hallazgos

### 🔴 Altos

**H1. `labeler.yml` usa `pull_request_target` con `pull-requests: write` y sin pineo por SHA.**
`actions/labeler@v5` es first-party, pero `pull_request_target` corre con el token del repo base sobre código no confiable del PR. Aunque `actions/labeler` no ejecuta checkout de código del PR, es la superficie más frecuente de escalado en la comunidad. Pinear por SHA elimina el riesgo de que un tag mutable cambie comportamiento.

**H2. `release-drafter.yml` se dispara en `pull_request` (no `_target`) y pide `contents: write` + `pull-requests: write`.**
Desde PRs de fork, `GITHUB_TOKEN` es de solo lectura sin importar lo que declare el workflow: el step va a fallar silenciosamente o generar ruido. En un repo privado sin forks el impacto es cero, pero la config es inconsistente. Mejor: dispararlo solo en `push: main` (que es donde realmente actualiza el draft) y quitar el trigger de `pull_request`.

**H3. `concurrency.cancel-in-progress: true` aplicado también a `push: main` en `ci.yml`, `codeql.yml`, `release-drafter.yml`.**
Un merge rápido a main puede cancelar el run del commit anterior de main → pierdes histórico de CI y de CodeQL para ese SHA. Estándar: cancelar solo en PRs.

### 🟡 Medios

**M1. `supabase-lint.yml` — checks textuales con falsos positivos.**

- `grep -qiE 'security[[:space:]]+definer'` matchea comentarios, strings o CREATE POLICY con la palabra "definer" en cualquier parte. Igual `create table public.*`.
- No detecta `CREATE TABLE ... IF NOT EXISTS "public"."x"` con comillas dobles.
- Bloqueo GRANT/RLS/POLICY aplica también a `CREATE TABLE public.<x> ... GRANTS on public.<otro>`; un GRANT sobre otro objeto pasa el check.
Impacto: falsos negativos (deja pasar migraciones sin GRANT real) más que falsos positivos. Fix: complementar con `supabase db lint` real contra una DB temporal, o migrar el guard a un script Node que parse SQL con `pg-query-emscripten`.

**M2. `bun-version: "1.2.x"` en composite.**
Floating patch. Un runner que agarra 1.2.29 vs 1.2.18 puede producir lockfile drift (el bug reciente de `bun.lockb` viene de ahí). Fijar a versión exacta y dejar que dependabot la actualice via `github-actions` ecosystem (o añadir `bun` como target explícito).

**M3. Mezcla de pineo por SHA vs por tag.**

- Pineado por SHA: `oven-sh/setup-bun`, `denoland/setup-deno`, `mikepenz/action-junit-report`, `reviewdog/action-actionlint`, `treosh/lighthouse-ci-action`, `gitleaks/gitleaks-action`, `release-drafter`, `supabase/setup-cli`. ✅
- Solo tag mayor (aceptable para first-party pero inconsistente): `actions/checkout@v6`, `actions/cache@v4`, `actions/upload-artifact@v7`, `github/codeql-action/*@v3`, `actions/labeler@v5`.
Policy sugerida: SHA en todo lo de terceros (H1 arriba) y tag mayor solo en `actions/*` y `github/*`.

**M4. `codeql.yml` con `paths-ignore` para `**/*.md`, `.lovable/**`.**
En schedules (`cron`) los `paths-ignore` no aplican; en PRs sí. OK, pero comentar el motivo — un lector puede creer que el cron se salta y no analiza esos paths.

**M5. `bundle-size.yml` — comentario en PRs desde forks fallará.**
`gh pr comment` requiere `pull-requests: write`. Desde forks el token es read-only. El `if:` no filtra. Añadir `if: github.event.pull_request.head.repo.full_name == github.repository` al step de comentario para evitar error rojo en PRs externos.

**M6. `ci-success` incluye a `edge-functions` y `e2e` que pueden skipearse por secretos.**
Un job skipped tiene `result == 'skipped'`, no rompe el gate (bien). Pero significa que un PR de fork sin secrets pasa "verde" con menos cobertura. Documentar explícitamente en README o dejar `edge-functions` y `e2e` como required checks separados en branch protection (no en `ci-success`).

### 🟢 Bajos / nice-to-have

**B1.** `ci.yml` no usa `permissions: {}` a nivel workflow y luego re-declara por job. Ya está bien (default `contents: read`), pero explicitar `permissions: {}` global y elevar por job es más defensivo.

**B2.** `edge-functions` no pinea `deno-version: v2.x` a minor (`v2.1.x`). Menor prioridad.

**B3.** `e2e` — el cache key de Playwright usa el string crudo del `package.json` (`^1.48.0`). Si el lockfile resuelve a otra versión, el cache es stale. Mejor leer la versión efectiva de `bun.lock` o de `node_modules/@playwright/test/package.json` tras `bun install`.

**B4.** `bundle-size.yml` compara con base branch pero no falla si el diff supera un threshold. Considerar `fail-on: +5%` o similar como gate opcional.

**B5.** `gitleaks.yml` tiene `schedule` semanal pero `GITLEAKS_LICENSE` no está configurado — para repos privados la action de gitleaks lo requiere. Si el repo es público, ignorar.

**B6.** `.gitleaksignore` lista fingerprints específicos; documentar en README qué son y por qué es seguro ignorarlos (ya está en `.gitleaks.toml`, cerrar el loop).

**B7.** No hay workflow que valide el `changelog.json` (esquema, ordenamiento descendente, versión única). Dado que es un core rule del proyecto y toca cada PR, un check ligero (10 LOC en Node) evitaría regresiones.

---

## Cambios propuestos (priorizados)

### Bloque 1 — Seguridad (aplicar todo)

1. `labeler.yml`: pinear `actions/labeler@<sha> # v5.0.0`.
2. `release-drafter.yml`: eliminar trigger `pull_request`, dejar solo `push: main` + `workflow_dispatch`. Quitar `permissions: pull-requests: write` del job (no lo necesita para el draft).
3. `bundle-size.yml`: gate el step de comentario a PRs internos (`if: github.event.pull_request.head.repo.full_name == github.repository`).

### Bloque 2 — Estabilidad

4. `ci.yml`, `codeql.yml`, `release-drafter.yml`: separar `concurrency` — para `push: main` usar `cancel-in-progress: false`; para PRs mantener `true`. Se resuelve con expresión: `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.
5. Composite `setup-bun-project`: fijar `bun-version` a versión exacta (p.ej. `1.2.29`) y añadir `bun` al `dependabot.yml` (npm ecosystem no cubre bun; opción: bump manual controlado).

### Bloque 3 — Calidad de gates

6. `supabase-lint.yml`: reescribir el guard en Node/TS con parser SQL real, o al menos:
  - Filtrar comentarios antes de grep.
  - Requerir GRANT que mencione **la misma tabla** creada (no cualquier GRANT).
  - Requerir `ENABLE ROW LEVEL SECURITY` con nombre de tabla explícito.
7. Nuevo micro-workflow `changelog-check.yml` que valide en cada PR:
  - Existe `public/changelog/v<X.Y.Z>.json` para la primera entrada de `changelog.json`.
  - `changelog.json` está ordenado descendente por semver.
  - No hay versiones duplicadas.

### Bloque 4 — Nice-to-have

8. `e2e`: derivar versión efectiva de Playwright tras `bun install` para la cache key.
9. `bundle-size`: opcional, threshold configurable de regresión (%).
10. Comentario en `codeql.yml` aclarando que `paths-ignore` no aplica al schedule.

---

## Fuera de alcance

- Migrar `test:rls` a Postgres real en CI (hoy corre contra mocks). Es una discusión de arquitectura de testing, no de workflow.
- Añadir Trivy / Snyk / Semgrep. Ya hay CodeQL + gitleaks; ampliar sería otra decisión.
- Cambiar branch protection rules (no se hace desde workflow).

---

## Detalles técnicos

**Concurrencia condicional:**

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

**Comentario condicional en bundle-size:**

```yaml
- name: Comparar y comentar PR
  if: >
    steps.base.outputs.base_bytes != '' &&
    github.event.pull_request.head.repo.full_name == github.repository
```

**changelog-check.yml (esqueleto):**

```yaml
name: Changelog check
on:
  pull_request:
    paths: ["public/changelog.json", "public/changelog/**"]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/setup-bun-project
      - run: bun scripts/validate-changelog.ts
```

---

¿Aplico los 3 bloques completos, o prefieres empezar solo por el Bloque 1 (seguridad) y validar CI antes de seguir? Aplica los 4 bloques completos.