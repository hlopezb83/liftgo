# Plan: Auditoría de cobertura de pruebas y cierre de brechas (Ronda 2)

## Objetivo
Responder con evidencia si el ERP cuenta con pruebas suficientes —especialmente para los cambios de la Auditoría R2 (DB2-01..DB2-21, FE2-01..FE2-13)— y cerrar las brechas críticas que se detecten.

## Estado actual confirmado

| Capa | Cantidad | Observación |
|---|---|---|
| Tests unitarios / integración (Vitest) | 578 archivos | Incluyen 15 tests de RLS (`*.rls.test.ts`). |
| Tests E2E (Playwright) | 25 specs | Algunos recientes requieren estabilización (v7.260.1..v7.260.3). |
| Tests Edge Functions (Deno) | 42 archivos | `invite-user/index_test.ts` solo tiene smoke tests; no valida el fix de DB2-01. |
| Archivos fuente `.ts/.tsx` | 997 | Muchos módulos de UI tienen 0 tests directos. |
| Cobertura global configurada | 14% líneas, 10% funciones, 14% statements, 12.5% branches | Umbrales bajos; directorios críticos (`src/lib/domain`, `src/features/invoices/lib`, `src/features/accounts-payable/lib`) tienen umbrales mayores pero aún no son robustos. |
| Cambios R2 en base de datos | Aplicados en migraciones `2026072916*` y `2026072917*` | No se encontraron tests frontend/edge que ejerciten `validate_transition` en INSERT, `guard_quote_delete`, `guard_is_e2e_flag`, `sync_invoice_status_from_payments`, etc. |

## Hallazgos preliminares de brechas

1. **Seguridad / máquina de estados (P0/P1):** los triggers `validate_transition`, `guard_quote_delete`, `guard_is_e2e_flag`, `sync_invoice_status_from_payments` y similares carecen de tests de integración.
2. **Edge function `invite-user`:** el test existente no cubre el escenario de DB2-01 (upsert con `onConflict: "user_id"` y error 500 ante fallo de asignación de rol).
3. **Frontend R2:** cambios como validación inline de daños (FE2-12), `isError` en portal (FE2-04), advertencia de completed (FE2-13) y truncamiento no tienen tests visibles.
4. **Cobertura global:** 14% es insuficiente para evitar regresiones en un ERP fiscal; los umbrales actuales no reflejan el riesgo real.

## Fases de trabajo propuestas

### Fase 1 — Inventario y línea base (read-only)
1. Ejecutar `vitest run --coverage` y generar reporte HTML/JSON.
2. Cruzar el reporte con el diff de `lovable-r2liftgo-3.md` para listar, por cada bloque DB2/FE2, si existe test y qué tipo.
3. Revisar los 25 specs E2E y marcar cuáles cubren flujos R2; identificar specs inestables.
4. Entregar matriz de cobertura: `módulo → cambio R2 → test unitario → test integración → test E2E → estado`.

### Fase 2 — Cierre de brechas críticas (P0/P1)
1. **DB2-01:** ampliar `supabase/functions/invite-user/index_test.ts` para simular rol residual y verificar que el upsert por `user_id` lo reemplaza y que un fallo devuelve 500.
2. **DB2-02 / DB2-05 / DB2-11:** crear tests de integración contra Supabase (local o remoto de staging) que validen `INSERT` con estados iniciales permitidos/prohibidos y transiciones inválidas (`completed→confirmed`, `accepted→draft`, etc.).
3. **DB2-07:** test de que el flip de `is_e2e` siempre genera audit log y que usuarios no-e2e no pueden modificar la flag.
4. **DB2-12:** test de que borrar un daño restaura el forklift y exige cargo obligatorio.
5. **DB2-18:** test de que no se puede borrar una cotización `accepted` ni una con bookings ligados.
6. **FE2-04 / FE2-12 / FE2-13:** tests de componente para estados de error del portal, validación inline de daños y advertencia de completed.

### Fase 3 — Cobertura de dominio fiscal y monetario
1. Aumentar tests de `src/lib/domain`, `src/features/invoices/lib` y `src/features/accounts-payable/lib` hasta alcanzar umbrales más exigentes (propuesta: 70% líneas/funciones/declaraciones, 60% branches).
2. Añadir tests para parsers XML/CSV de conciliación bancaria, totales de factura, cálculo de renta y créditos.

### Fase 4 — Estabilización de E2E y Edge Functions
1. Correr el suite E2E completo, documentar fallos y estabilizar specs inestables.
2. Añadir tests de Edge Functions para funciones críticas sin cobertura (cancelación CFDI, complementos de pago, facturación recurrente).

### Fase 5 — Ajuste de umbrales y CI
1. Actualizar `vitest.config.ts` con umbrales realistas basados en las mediciones de la Fase 1.
2. Asegurar que el workflow `ci.yml` falle si cobertura baja de los umbrales.
3. Agregar paso opcional de publicación de reporte de cobertura como artifact.

### Fase 6 — Changelog y versión
1. Registrar avance en `public/changelog.json` y `public/changelog/v{X.Y.Z}.json`.
2. Sincronizar `package.json` y `public/version.json`.

## Criterios de éxito
- Matriz de cobertura R2 publicada y aprobada.
- Todos los items P0/P1 de R2 tienen al menos un test unitario o de integración.
- Cobertura global sube al menos 5 pp respecto a la línea base.
- Suite E2E pasa estable en local y CI.
- Sin errores de lint, typecheck ni Knip.

## Riesgos y notas
- Los tests de integración contra Supabase requieren base de datos limpia; usar `supabase db reset` o el helper de seeds existente.
- Algunos triggers usan `SECURITY DEFINER`; los tests deben ejecutarse con roles distintos (`anon`, `authenticated`, `service_role`) para validar RLS y guards.
- No modificar lógica de negocio durante esta tarea salvo que un test exponga un bug real; en ese caso se documenta y se corrige en el mismo sprint.
