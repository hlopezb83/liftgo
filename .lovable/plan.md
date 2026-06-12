## Diagnóstico

Tu base ya cuenta con la columna `is_e2e` en las tablas críticas (decisión previa para aislar datos de testing). El conteo actual de contaminación es:

| Tabla | Filas E2E | Total |
|-------|-----------|-------|
| customers | 12 | 30 |
| forklifts | 12 | 70 |
| equipment_models | 12 | 20 |
| quotes | 12 | 78 |
| bookings | 12 | 29 |
| invoices | 12 | 76 |
| payments (vía invoice) | 11 | 54 |
| activity_feed | 1,462 | 3,061 |

Tablas dependientes (deliveries, return_inspections, contracts, damage_records, booking_extensions, quote_assigned_forklifts, maintenance_logs) **no tienen filas asociadas a los E2E actuales**, así que la limpieza es directa.

## Objetivo

Eliminar los 1,533 registros marcados `is_e2e = true` (más los pagos huérfanos asociados a invoices E2E) de forma **atómica y reversible vía revisión de migración**, sin tocar datos reales.

## Plan

### 1. Migración con RPC `purge_e2e_data()`
Función `SECURITY DEFINER`, restringida a rol `admin` vía `has_role(auth.uid(),'admin')`. Borra en este orden (respeta FKs):

```text
1.  activity_feed         WHERE is_e2e
2.  payments              WHERE invoice_id IN (SELECT id FROM invoices WHERE is_e2e)
3.  invoices              WHERE is_e2e
4.  bookings              WHERE is_e2e
5.  quote_assigned_forklifts WHERE quote_id IN (SELECT id FROM quotes WHERE is_e2e)
6.  quotes                WHERE is_e2e
7.  forklifts             WHERE is_e2e
8.  equipment_models      WHERE is_e2e
9.  customers             WHERE is_e2e
```

Todo dentro de una sola transacción de la función. Devuelve un JSON con el conteo borrado por tabla para auditoría.

### 2. Ejecución única
Una vez aprobada la migración, llamo `SELECT public.purge_e2e_data();` desde el tool de datos para ejecutar la purga real. Muestro el conteo borrado por tabla.

### 3. Verificación
Re-query final confirmando `count(*) FILTER (WHERE is_e2e) = 0` en todas las tablas.

### 4. Changelog
Entrada `v6.46.6` patch: "Purga de datos E2E contaminados en producción demo".

## Lo que NO se toca

- Cualquier fila sin `is_e2e = true`.
- Pagos no vinculados a invoices E2E.
- Tablas sin flag `is_e2e` (no hay dependencias detectadas).
- Esquema (no se elimina la columna `is_e2e`; sigue siendo útil para futuros tests).

## Riesgo

Bajo. Los flags `is_e2e` fueron escritos por el propio harness de testing y no pueden haber sido marcados accidentalmente desde la UI. Aun así, la migración crea la función pero **no la ejecuta**; la ejecución es un paso separado que puedes cancelar.
