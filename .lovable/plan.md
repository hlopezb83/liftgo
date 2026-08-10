# Paquete R2 — validación y corrección (26 hallazgos)

Validé los 26 puntos contra el código y contra la base de datos real. **24 son bugs vigentes**, 1 está parcialmente resuelto y 1 no es un bug de código.

## Resultado de la validación

| Bloque | Reales | Notas |
|---|---|---|
| 01 Finanzas / Reconciliador CFDI (6) | 6/6 | Todos confirmados con evidencia en `reconcile-stamping-invoices` y `process-cfdi-retry-queue` |
| 02 Flota / Reservas (11) | 10/11 | R2-10 son backfills de datos: primero cuento filas afectadas |
| 03 Frontend / Seguridad / Reportes (9) | 8/9 | R2-02 (invite-user) ya devuelve el link, falta mostrarlo al admin |

### Hallazgo extra, no contemplado por el documento

Dos migraciones existen como archivo en el repo pero **no están vivas en la base**: `assign_forklift_to_sale_quote` (M14) y `has_active_rental` (M18) no aparecen en `pg_proc`, y el CHECK de `hours_reading >= 0` (M15) no está en `pg_constraint`. Hoy la venta de equipo se hace con tres llamadas sueltas desde el cliente, sin ninguna validación de unidad archivada ni de renta activa, y nada impide guardar un horómetro negativo.

Analogía: el documento asumía que la puerta tenía una cerradura floja; al revisar, la puerta no tiene cerradura.

## Qué se va a corregir

### Fase 1 — Riesgo fiscal y de datos (crítico)
- **Reconciliador CFDI**: sacar las consultas de REP y notas de crédito antes del `return` temprano (hoy quedan en bloqueo permanente si no hay facturas atascadas); agregar contadores de fallos consecutivos para que un REP/NC no se revierta a error al primer "no encontrado" del PAC (riesgo de CFDI duplicado ante el SAT); no consumir presupuesto de reintentos cuando la consulta al PAC falla; tratar "SDK sin listado" como consulta fallida, nunca como inexistente.
- **Flota**: migración combinada que corrige `get_available_forklifts` y `soft_delete_maintenance_log`, y replica los mismos filtros en `create_booking` (hoy la disponibilidad y la reserva se contradicen).
- **Mantenimiento recurrente**: la edge function debe escribir `manual_cost` y dejar de escribir `next_service_date`.
- **Venta de equipo**: recrear `has_active_rental` y `assign_forklift_to_sale_quote` con los guards completos y migrar el hook a esa RPC.
- **Permisos de reportes**: agregar el guard `has_permission('Reportes','read')` a las 6 RPCs `report_*` (hoy cualquier usuario autenticado las puede llamar) e incluir el ajuste de tipos/nulabilidad de `report_revenue_month_invoices`.

### Fase 2 — Correcciones medias
- Horómetro: rechazar negativos/no finitos en el formulario, comparar contra la última lectura global de la unidad y restaurar el CHECK en base.
- Fallback de daños: `manual_cost` en lugar de `cost`.
- Invalidación de caché: llaves `report` y rango de reservas al mutar facturas, reservas y mantenimientos.
- `invite-user`: mostrar el enlace de recuperación al administrador con opción de copiarlo.
- Guard `is_active` en edge functions: fallar cerrado (503) cuando la consulta de perfil falla, en vez de dejar pasar.

### Fase 3 — Bajas
- Rama muerta en `decideRowAction`; extraer la decisión del retry-queue a funciones puras que los tests importen en vez de reimplementar.
- Superficie de `cfdi_xml_pending`: distintivo y botón "Reintentar descarga".
- Entregas: ocultar "Completar" en canceladas; permitir reprogramar recolección con reserva completada.
- Previews de fotos de daño: revocar los object URLs solo al desmontar.
- Resolución legada de montacargas por token completo, no por subcadena.
- Tests RLS: reemplazar el `EXCEPTION WHEN others` que se traga el fallo por el patrón de bandera, en los 11 archivos.
- Purgar la caché legada `liftgo:rq-cache:v1`.
- `v_overdue_invoices`: alinear el fallback de tipo de cambio al criterio de `toMxn`.
- Aviso visible de truncamiento en el drill-down de utilización y bloqueo del diálogo de recolección mientras guarda.

### Fase 4 — Backfills (R2-10)
Antes de aplicar, cuento las filas afectadas por cada patrón (H7b, hueco de `status_logs` H8b, limpieza de `next_service_date` en pólizas) y reporto los números; solo ejecuto los que tengan filas reales.

## Detalles técnicos
- Orden obligatorio: flota (migración combinada → `create_booking` → edge) → finanzas 01→06 → frontend/seguridad. Los diffs de finanzas se encadenan sobre el estado del anterior.
- Migraciones nuevas: contadores `payments.rep_lookup_attempts` y `credit_notes.lookup_attempts`; guards de reportes; `create_booking`; `get_available_forklifts` + `soft_delete_maintenance_log`; `has_active_rental` + `assign_forklift_to_sale_quote`; CHECK de `hours_reading`; `validate_delivery_booking_integrity`; `v_overdue_invoices`.
- Antes de las migraciones con CHECK: verificar que no existan `hours_reading < 0` históricos ni `damage_records` con `invoice_id` duplicado; si los hay, normalizo primero.
- Tras las migraciones, regenerar `src/integrations/supabase/types.ts`.
- Verificación: `deno test` de las dos edge functions, suite Vitest completa, `tsgo`, ESLint sin warnings, y smoke SQL de las funciones tocadas.
- Cierre: entrada nueva de changelog (`public/changelog.json` + `public/changelog/vX.Y.Z.json`) y sincronizar `package.json` / `public/version.json`.

## Riesgo residual (queda fuera)
Los caminos `rep_xml_pending` / `nc_xml_pending` reintentan descargas sin contador, y `v_invoices_with_balance.balance_mxn` conserva el fallback FX=1. Ambos quedan documentados para una ronda posterior.
