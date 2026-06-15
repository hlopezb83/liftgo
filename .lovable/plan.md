# Diagnóstico del run de CI

Analicé el ZIP de logs (run #27527151246). De los 9 jobs, **3 fallaron** y arrastraron el gate `CI success` a rojo:

| Job | Estado | Causa raíz |
|---|---|---|
| Edge Functions (Deno) | ❌ 40/40 fallaron | `secrets.VITE_SUPABASE_URL` vacío → `fnUrl()` arma `/functions/v1/...` (URL relativa inválida) → `TypeError: Invalid URL` |
| E2E Playwright shard 1 | ❌ | Mismo: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` no existen en Secrets del repo, y el `globalSetup` hace `throw` explícito |
| E2E Playwright shard 2 | ❌ | Idéntico al shard 1 |
| Actionlint | ⚠️ con error | reviewdog reporta nits de shellcheck (SC2086, SC2129) en scripts inline de workflows, y satura el límite de annotations (`Too many results`) marcando el step como error |
| Typecheck / ESLint / Knip / RLS / Vitest / Build | ✅ | Sin issues |

Warning informativo (no rompe): `actions/cache@v4` corre sobre Node 20, deprecado a partir del 16-sep-2026. No hay v5 todavía; basta con monitorear.

# Causa principal: faltan Secrets en GitHub

Los workflows están bien escritos, pero el repo **no tiene configurados** estos secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`
- `E2E_PORTAL_EMAIL` / `E2E_PORTAL_PASSWORD`

Eso es **configuración manual en GitHub** (Settings → Secrets and variables → Actions). No se puede arreglar desde Lovable; los valores ya están en `.env` del proyecto.

# Plan de cambios en código (lo que sí puedo arreglar acá)

## 1. `supabase/functions/_shared/test-helpers.ts` — defensivo contra env vacío
El operador `??` no captura strings vacíos. Si el secret existe pero está vacío, falla con URL relativa. Cambiar a:

```ts
const envUrl = (Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "").trim();
export const SUPABASE_URL = envUrl || "http://localhost:54321";
```

Y agregar al inicio del helper un `throw` claro si `SUPABASE_URL` no es una URL absoluta válida, para que el mensaje sea entendible en CI.

## 2. `.github/workflows/ci.yml` — guardas tempranas en jobs que requieren secrets
Agregar al inicio de los jobs `e2e` y `edge-functions` un step que valide presencia de secrets y, si faltan:
- En PRs desde forks o repos sin secrets: marcar el job como **skipped** (no rojo) con `if: ${{ secrets.VITE_SUPABASE_URL != '' }}` a nivel job.
- En `main` o ramas internas: fallar con mensaje explícito que indique exactamente qué secret falta y dónde configurarlo.

Esto evita el flood de 40 fallos confusos y deja un solo mensaje accionable.

## 3. `.github/workflows/ci.yml` + composite action — limpiar shellcheck (SC2086, SC2129)
Resolver los nits que dispara Actionlint:
- **SC2086**: entrecomillar variables (`"$VAR"` en lugar de `$VAR`) en scripts inline de los steps (matrix shards, summaries, generación de reportes).
- **SC2129**: agrupar redirecciones consecutivas (`{ echo a; echo b; } >> "$GITHUB_STEP_SUMMARY"`).

Targets afectados: `ci.yml` (steps de e2e summary, edge-functions runner, ci-success), `bundle-size.yml`, `supabase-lint.yml`, `.github/actions/setup-bun-project/action.yml`.

## 4. `.github/workflows/ci.yml` — bajar ruido de reviewdog
Cambiar `fail_on_error: true` (deprecado) por `fail_level: error`, y agregar `filter_mode: nofilter` para que solo reporte cambios del PR. Eso evita el `Too many results in diff` que actualmente convierte warnings en error de step.

## 5. Changelog
Entrada nueva **v6.73.1** (patch):
- `public/changelog.json` (índice)
- `public/changelog/v6.73.1.json` (detalle)

# Lo que NO entra en este plan (acción tuya manual)
1. Configurar los 7 Secrets en GitHub (te paso copy-paste de nombres + valores tomados de tu `.env`).
2. Configurar branch protection en `main` exigiendo el job `CI success`.
3. (Opcional) Eliminar `actions/cache@v4` cuando salga v5 con Node 24.

# Detalles técnicos
- No toco `auto-gen` (`client.ts`, `types.ts`, `.env`, `config.toml`).
- No cambio comportamiento de las edge functions, solo el helper de tests.
- El `if` a nivel job que skipea cuando faltan secrets usa `${{ secrets.NAME != '' }}` que es estándar y no requiere repo público.
- Actionlint se mantiene en el gate `ci-success` después del fix.

# Resultado esperado
Después del fix + configurar los secrets manualmente: **9/9 jobs verdes**. Si decides no configurar secrets ahora, los jobs e2e/edge-functions quedan **skipped** (gris) y `CI success` pasa en verde con los 7 jobs restantes.
