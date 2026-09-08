# Roadmap — Estabilización CI TanStack Start

- [x] Fix build CI: nitro output explícito a dist/ (v8.0.3) — confirmado en GitHub run 34190853585
- [ ] Limpieza knip exports/types (informativo, `bun run knip:deep`): no bloquea CI; pendiente de bajo valor
- [x] A) E2E falla: `__name is not defined` transversal (desktop+mobile, smoke-nav.spec.ts:70/99 y otras suites). Investigar causa real (transforms, page.evaluate/addInitScript serializadas, bundles). NO parche con global genérico. Shard1: portal-statement sin auth token en localStorage tras 30s + expect visible. Verificar login/storage con migración.
- [x] B) SQL smoke `supabase/tests/r_fix40_contratos_duplicado_trigger_smoke.sql` falla (T1 y T6): depende de datos productivos (CTR-0002/CTR-0003, admin user_roles). Reescribir autocontenido con fixtures en transacción + rollback, preservando casos (duplicado histórico, concurrencia/candado, cancelación, reactivación). Validar en Supabase local. No usar continue-on-error para declarar verde.
- [x] SEGURIDAD (prioridad 1): guard fail-closed anti-producción en E2E (productionGuard.ts + setup/teardown/seed/supabaseEnv + precondición en CI). Pendiente de verificación real: provisionar backend Supabase aislado para el job e2e (secrets E2E_SUPABASE_*).
- [x] C) Auditoría lean de workflows (v8.2.0): ci.yml reescrito, smoke de arranque sobre el build real, tests Deno offline en CI, E2E on-demand, prod-smoke horario; retirados bundle-size/lighthouse/changelog-check. Ver docs/ci.md.
- [ ] Verificación final en GitHub (requiere push): build con config GitHub + bun frozen lockfile, E2E contra ese artefacto, suites SQL. Reportar SHA, causas, comandos/resultados, pendientes. No declarar CI verde hasta confirmación de GitHub.

- [ ] BLOQUEADO (requiere al usuario): provisionar backend Supabase aislado y cargar secrets `E2E_SUPABASE_*` para habilitar `e2e-on-demand.yml`.

Restricciones: YAGNI, no publicar, no tocar datos productivos/secretos/protecciones, no bajar cobertura ni quitar tests/reglas, no silenciamientos, preservar cambios ajenos en HEAD (0b7b242c).
