# Verificación de la guía de bugs pendientes (22 ítems + Paso 0)

Revisé la guía contra el código actual y contra la base de datos real. Resumen: **el "Paso 0 bloqueante" es una falsa alarma**, y de los demás ítems la mayoría sí son bugs reales, pero varios ya están cerrados o solo parcialmente vigentes.

## Paso 0 — NO es un bug (falso positivo)

La guía afirma que la migración `20260831054419` aborta y deja 8 migraciones sin aplicar. Consulté la base:

- `get_income_statement` existe y **ya contiene** `fx_missing`, `sb.exchange_rate` y el filtro por `approval_status` → la migración sí se aplicó.
- Las 8 migraciones "bloqueadas" también están aplicadas: `contracts.signed_snapshot` existe, `guard_maintenance_reopen`, `release_damage_on_invoice_cancel`, la vista `v_booking_occupancy` y `get_portal_invoices` con conversión canónica.

El auditor simuló los `replace()` contra un cuerpo viejo (`20260825212621`), ignorando que migraciones posteriores del 31/08 ya habían cambiado el filtro de `sb.status`. Analogía: revisó la receta de ayer para decir que el pastel de hoy no se horneó — pero el pastel está en la mesa.

Recomendación: **no rehacer nada por Paso 0**. Como higiene aparte, sí conviene dejar de usar la técnica `pg_get_functiondef + replace()` en migraciones futuras.

## Ítems verificados como bugs REALES

| ID | Evidencia comprobada |
|---|---|
| B5-02 | `CustomerStatementDocument.tsx`: `balance = total_invoiced - total_paid`, sin restar notas de crédito |
| A6R2-2 | `reject_supplier_bill` en la base escribe `approved_by`; no existen `rejected_by/at` |
| A4B-05 | No existen `restore_maintenance_log` ni `restore_damage_record` en la base |
| A2-7 | `get_mrr_detail` sigue con manejo FX incompleto (fallback 1:1) |
| A6R2-7 | Buffer de 3 días hardcodeado en `create_booking` y `get_available_forklifts` |
| A5-05 | No hay cableado de `version` en el flujo de cotizaciones ni de reservas |
| A4-05 | `hasValidRfcChecksum` no se usa en ninguna edge function (solo cliente) |
| Residual (a) | Defaults `616` / `06600` en `stamp-credit-note` y `stamp-payment-complement` |
| Residual (b) | `create_recurring_invoice` sigue con `COALESCE(..., 'G03')` |
| Residual (c) | Llave de agrupación recurrente = cliente + periodo, sin moneda |

## Ítems ya cerrados o mal descritos

- **2A-1 / 2A-2 (ER sin FX y bills draft/rejected):** ya aplicados en la base vía `20260831054419`. Solo queda opcional el aviso de `fx_missing` en la UI del reporte.
- **A3B-03 (inspección con fecha futura):** el esquema del formulario ya rechaza fechas futuras; **falta solo el guard en la RPC** `complete_return_inspection`, que aún permite +30 días. Vigente pero de alcance menor al descrito.
- **A2-3 (lote CxP abandonado):** la RPC `cancel_supplier_payment_batch` ya existe; queda por verificar únicamente su cableado en la UI.
- **A1-6 (prefill de cotizaciones):** la parte de cantidad/tarifa ya se corrigió; sigue vigente solo el colapso por `found.id` y el `rate_type` ignorado.

## Ítems que faltan por verificar en detalle

A3B-07 (deliveries `type='return'`), A5-07 (Gantt sin buffer), A6R2-3 (snapshot de contrato sin plantilla/`acquisition_cost`), B5-01 (catch-up a tarifa vigente), A4B-08 (régimen fiscal sin catálogo), A2-9 (dedup de gastos), A3B-05 (re-conversión de cotizaciones canceladas). Requieren lectura de código más profunda; los verificaría antes de tocarlos.

## Cómo propongo seguir

1. Cerrar la verificación pendiente de los 7 ítems restantes (solo lectura, en paralelo con subagentes).
2. Lote rápido de bajo riesgo: B5-02, residuales (a), (b) y (c), guard de fecha futura en `complete_return_inspection`.
3. Lote de integridad backend: A6R2-2 (`rejected_by/at`), A4B-05 (restores), A4-05 (RFC en servidor), A2-7 (FX en MRR).
4. Lote de configuración/UX: A6R2-7 (buffer configurable) + A5-07 (Gantt), A5-05 (bloqueo optimista).

Cada lote con pruebas focalizadas, migraciones que cumplen las reglas permanentes de SQL, y actualización de `CHANGELOG.md` y `public/version.json`.
