## Diagnóstico

Facturas timbradas cuyo `invoice_number` interno no coincide con el folio devuelto por Facturapi:

| Actual | Estado | Folio PAC | Debería ser |
|---|---|---|---|
| FAC-0076 | cancelada | 75 | **FAC-0075** |
| FAC-0077 | timbrada | 76 | **FAC-0076** |
| FAC-0085 | timbrada | 78 | **FAC-0078** |

Causa: FAC-0077 se creó antes del sistema de folio diferido; FAC-0085 se creó después pero desde un cliente con bundle cacheado, así que consumió un folio interno directo en lugar de `BORRADOR-XXXX`, y `assign_stamped_invoice_number` no promovió (solo actúa sobre BORRADOR-).

## Alcance

Solo el arreglo puntual de datos. **No** se modifica lógica ni edge functions (fuera de alcance según respuesta).

## Migración de datos

Renombrar en cadena para respetar el unique index de `invoice_number`, en una sola transacción:

```sql
BEGIN;
-- Paso pivote temporal para evitar cualquier colisión intermedia
UPDATE invoices SET invoice_number = 'FAC-TMP-0076' WHERE invoice_number = 'FAC-0076';
UPDATE invoices SET invoice_number = 'FAC-TMP-0077' WHERE invoice_number = 'FAC-0077';
UPDATE invoices SET invoice_number = 'FAC-TMP-0085' WHERE invoice_number = 'FAC-0085';

-- Reasignaciones finales alineadas al folio del PAC
UPDATE invoices SET invoice_number = 'FAC-0075' WHERE invoice_number = 'FAC-TMP-0076'; -- folio 75
UPDATE invoices SET invoice_number = 'FAC-0076' WHERE invoice_number = 'FAC-TMP-0077'; -- folio 76
UPDATE invoices SET invoice_number = 'FAC-0078' WHERE invoice_number = 'FAC-TMP-0085'; -- folio 78
COMMIT;
```

Verificaciones previas confirmadas:
- No existe FAC-0075 ni FAC-0078 en la tabla.
- Ninguna otra columna (`payments`, `credit_notes`, `invoice_bookings`, etc.) referencia `invoice_number` como texto — todas usan `invoice_id` (FK), así que renombrar es seguro.
- `audit_logs` capturará automáticamente el cambio de `invoice_number` para trazabilidad.

## Cambios de código

Ninguno.

## Changelog

Entrada patch `v6.107.2`:
- Título: "Realineación de folios internos con Facturapi"
- Detalle: FAC-0076/0077/0085 se renombraron a FAC-0075/0076/0078 para alinear el número interno con el folio devuelto por el PAC.

## Fuera de alcance

- Endurecer stamp-cfdi para autocorregir cuando el invoice_number no empieza con BORRADOR-.
- Forzar refresh del cliente cuando cambia la versión publicada.
- (Ambos pueden abordarse después si vuelve a ocurrir.)
