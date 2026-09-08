# Roadmap — Estabilización CI TanStack Start

- [x] Fix build CI: nitro output explícito a dist/ (v8.0.3) — confirmado en GitHub run 34190853585
- [ ] Limpieza knip exports/types (paso informativo rojo): 3 grupos de agentes + fix NavLink duplicado + ignorar types.ts autogenerado → verificar knip local + typecheck + changelog
- [x] A) E2E falla: `__name is not defined` transversal (desktop+mobile, smoke-nav.spec.ts:70/99 y otras suites). Investigar causa real (transforms, page.evaluate/addInitScript serializadas, bundles). NO parche con global genérico. Shard1: portal-statement sin auth token en localStorage tras 30s + expect visible. Verificar login/storage con migración.
- [x] B) SQL smoke `supabase/tests/r_fix40_contratos_duplicado_trigger_smoke.sql` falla (T1 y T6): depende de datos productivos (CTR-0002/CTR-0003, admin user_roles). Reescribir autocontenido con fixtures en transacción + rollback, preservando casos (duplicado histórico, concurrencia/candado, cancelación, reactivación). Validar en Supabase local. No usar continue-on-error para declarar verde.
- [ ] C) Revalidar workflows consumidores de build: bundle-size (cliente), lighthouse/prod-smoke, preview wrangler, sourcemaps Sentry. Confirmar generación/upload real o reportar credenciales faltantes.
- [ ] Verificación final: build con config GitHub + bun frozen lockfile, E2E contra ese artefacto, suites SQL. Reportar SHA, causas, comandos/resultados, pendientes. No declarar CI verde hasta confirmación de GitHub.

Restricciones: YAGNI, no publicar, no tocar datos productivos/secretos/protecciones, no bajar cobertura ni quitar tests/reglas, no silenciamientos, preservar cambios ajenos en HEAD (0b7b242c).
