# GitHub Actions faltantes

El CI actual (`.github/workflows/ci.yml`) ya cubre muy bien lint, typecheck, knip, tests + coverage, build, RLS, Edge Functions (Deno) y E2E (Playwright sharded) con gate `ci-success`. Lo que **falta** y aportaría valor real al proyecto:

## 1. `dependabot.yml` (configuración, no workflow)
Actualizaciones semanales automáticas de:
- `npm` (root) agrupando devDependencies menores/patch
- `github-actions` (mantener `actions/checkout@v6`, `setup-deno@v2`, etc. al día)
- Ignorar `jspdf` (locked en 4.0.0 por memoria de proyecto)

## 2. `codeql.yml` — análisis estático de seguridad
- Lenguajes: `javascript-typescript`
- Trigger: push/PR a `main` + cron semanal
- Permite el badge "Security" y bloquea vulnerabilidades de código (XSS, inyecciones, etc.)

## 3. `gitleaks.yml` — escaneo de secretos
- Corre en cada PR
- Detecta llaves de Supabase service_role, Facturapi, tokens accidentales
- Crítico porque el repo maneja CFDI/Facturapi y has tenido rotaciones de keys

## 4. `supabase-lint.yml` — validación de migraciones
- Trigger sólo cuando cambian `supabase/migrations/**`
- Ejecuta `supabase db lint` + verifica que cada `CREATE TABLE public.*` tenga `GRANT` y `ENABLE ROW LEVEL SECURITY` (regex check), alineado con tu core rule
- Falla el PR si faltan GRANTs (problema recurrente histórico)

## 5. `lighthouse.yml` — performance budget
- Ya existe `scripts/lighthouse-baseline.sh` y `docs/lighthouse/baseline.md` sin runner
- Workflow manual (`workflow_dispatch`) + nocturno (`schedule`) contra preview URL
- Sube reporte como artifact; opcionalmente compara contra baseline

## 6. `bundle-size.yml` — control de tamaño del bundle
- En cada PR, build de Vite y comenta el diff de tamaño en kB (gzip) vs `main`
- Útil porque cargas `jspdf` lazy y quieres mantener el bundle inicial pequeño

---

## Opcionales (menor prioridad, dilo si los quieres)
- **PR labeler** automático por paths (`features/fleet/**` → `fleet`, etc.)
- **Release Drafter** que arme release notes desde el changelog
- **Stale bot** para issues/PRs viejos
- **CODEOWNERS** + check requerido (sólo si trabajas en equipo)

---

## Detalles técnicos

- Todos los nuevos workflows reusarían `./.github/actions/setup-bun-project` cuando apliquen.
- Para CodeQL y Gitleaks: `permissions: security-events: write` y `contents: read`.
- Supabase lint: usar `supabase/setup-cli@v1` (no requiere proyecto remoto, sólo CLI local).
- Bundle-size: `andresz1/size-limit-action@v1` o script propio con `du -sh dist/assets/*.js`.
- No tocar `ci.yml` existente; cada workflow nuevo es archivo independiente para no inflar el wall-time del PR principal.

## Cambios al final
Entrada `v6.72.0` (minor) en `public/changelog.json` + `public/changelog/v6.72.0.json` describiendo los workflows agregados.

---

¿Quieres que implemente los **6 recomendados**, sólo un subconjunto (dime cuáles), o también los opcionales?
