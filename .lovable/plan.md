# Estado del paquete R3 y cierre de pruebas

## Qué ya está corregido (verificado en el código)

Las 10 correcciones del paquete R3 están aplicadas (v7.287.0 / v7.287.1):

- Bypass `app.maintenance_soft_delete` para archivar OTs cerradas: presente en la migración `20260811012125_...` (guard del trigger + `set_config(..., true)` dentro de la RPC).
- Horómetro global filtrando canceladas / `completed_at` nulo.
- RPC de venta con validación de cotización y `unassign_forklift_from_sale_quote` con hook migrado (`useUnassignForklift.ts`).
- Reset de `rep_lookup_attempts` / `lookup_attempts` en claims.
- Reconciliador usando `decideXmlFailure` real (`decisions.ts`) y limpieza del flag en todas las ramas de `download-cfdi`.
- `RoleGuard` sobre el bloque "XML por recuperar" en `InvoiceDetailActions.tsx`.
- Invalidación de `reportKeys.all` en mutaciones de pagos, daños y flota.
- Tests del badge "XML por recuperar" en `InvoiceDetailBadges.test.tsx`.

## Qué falta en cobertura de pruebas

1. **Smoke SQL de este R3**: `supabase/tests/r3_smoke.sql` corresponde a una ronda anterior (DB3-06 a DB3-17), no a este paquete. Falta un script que valide en staging: archivado de OT cerrada con refacciones, rechazo de mutaciones normales sobre OT cerrada, y guards de `assign`/`unassign_forklift_from_sale_quote`.
2. **`useUnassignForklift`**: no tiene test unitario (sí lo tiene `useAssignForklift`).
3. **Horómetro global**: sin test que compruebe la exclusión de entregas canceladas o sin `completed_at`.
4. **Invalidación de reportes**: sin test que verifique que las mutaciones de pagos/daños/flota invalidan `reportKeys.all`.

## Trabajo propuesto

- Crear `supabase/tests/r3_fixes_smoke.sql` con bloques transaccionales (ROLLBACK) para los 4 escenarios de base de datos citados.
- Añadir `useUnassignForklift.test.ts` (éxito, error de RPC, invalidación de caché) siguiendo el patrón de `useAssignForklift.test.ts`.
- Añadir test del cálculo global de horómetro con entregas canceladas / sin completar.
- Añadir tests de invalidación de `reportKeys.all` en un hook de pagos y uno de flota.
- Actualizar `package.json`, `public/changelog.json` y el detalle `public/changelog/v7.287.2.json` (patch).

## Notas técnicas

Sin cambios de comportamiento en producción: solo tests y script de smoke. Los tests usan los mocks de Supabase ya existentes en el proyecto; el SQL se ejecuta manualmente contra staging.
