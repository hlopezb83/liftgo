# Folio diferido: asignar `invoice_number` al timbrar

## Objetivo

Hoy asignamos `invoice_number` (FAC-0087, FAC-0088…) al **crear el borrador**. Como los usuarios timbran los borradores en orden arbitrario, el folio interno se desalinea del folio que devuelve Facturapi. Vamos a diferir la asignación del folio hasta el timbrado, tomando el `folio_number` de Facturapi como fuente de verdad. Los borradores quedan identificados con un placeholder (`BORRADOR-<n>`) y sin ocupar folio de la serie fiscal.

## Cambios

### 1. Base de datos

- Agregar secuencia `draft_invoice_seq` para numerar borradores (`BORRADOR-0001`, `BORRADOR-0002`…). Se usa solo para tener un identificador humano estable mientras la factura no está timbrada.
- Nuevo RPC `next_draft_invoice_number()` → devuelve el siguiente `BORRADOR-XXXX`.
- Nuevo RPC `assign_stamped_invoice_number(invoice_id uuid, serie text, folio text)` → dentro de una transacción:
  - Verifica que la factura esté en estado permitido (borrador recién timbrado).
  - Setea `invoice_number = 'FAC-' || lpad(folio, 4, '0')` (o el formato equivalente a la serie), `serie`, `folio`.
  - Falla con mensaje claro si ese `invoice_number` ya existe (colisión imposible si la serie es exclusiva de LiftGo, pero defendemos el invariante).
- Retiramos el uso de `next_invoice_number()` en el flujo de **creación**. La secuencia se conserva solo por compatibilidad histórica; no la borramos.

### 2. Backend / Edge Function `stamp-cfdi`

- Después de recibir la respuesta de Facturapi, en lugar de solo persistir `serie`/`folio`, llamar al RPC `assign_stamped_invoice_number` para setear también `invoice_number` a partir del `folio_number` que devuelve Facturapi.
- Mantener el fallback stub (sin PAC) generando un folio interno de la secuencia `invoice_number_seq` existente, para no romper el modo demo.

### 3. Frontend

- `useCreateInvoice`: pedir `next_draft_invoice_number()` en vez de `next_invoice_number()`.
- Preview de recurrentes (`peek_next_invoice_number`) reemplazado por `peek_next_draft_invoice_number` que muestra `BORRADOR-XXXX` para transparentar que aún no es folio fiscal.
- Header/listas: cuando `status = 'draft'`, mostrar el `invoice_number` (`BORRADOR-XXXX`) con badge visual "Borrador — folio se asigna al timbrar" para evitar confusión.
- Al timbrar, la UI refetchea el detalle y el `invoice_number` cambia de `BORRADOR-0012` a `FAC-0087`. Toast lo comunica: "CFDI timbrado — folio asignado: FAC-0087".

### 4. Migración de datos existentes

Facturas actuales:
- **Timbradas**: ya tienen `invoice_number` correcto (o reparado por el backfill anterior). No se tocan.
- **Borradores actuales (FAC-0087 a FAC-0095 según describes)**: los renombramos a `BORRADOR-XXXX` para liberar esos folios de la serie fiscal. Se hace en la misma migración con un `UPDATE … WHERE status = 'draft'`.
- Los folios FAC-0087..FAC-0095 quedan libres para que Facturapi los reasigne al siguiente timbrado.

### 5. Documentos dependientes

- Pagos, notas de crédito y complementos referencian por `invoice_id` (FK), no por `invoice_number`. No se rompen.
- PDFs de borrador: el `invoice_number` que se imprime en el PDF cambia (`BORRADOR-XXXX`). Como los borradores son puramente internos según confirmaste, no hay impacto externo.
- `activity_feed` / `audit_logs`: el renombrado al timbrar queda registrado como cambio de columna `invoice_number` en `audit_logs` (ya está cubierto por el trigger genérico).

### 6. Tests

- Unit tests del RPC `assign_stamped_invoice_number` (colisión, estado inválido, éxito).
- Tests del handler `stamp-cfdi` verificando que llama al RPC con los valores de Facturapi.
- Tests de `useCreateInvoice` verificando que ahora usa `next_draft_invoice_number`.
- Test de UI: borrador muestra prefijo `BORRADOR-`, después de timbrar muestra `FAC-`.

## Fuera de alcance

- No se cambia el formato de folio para notas de crédito, complementos, cotizaciones ni contratos (mantienen sus propias secuencias).
- No se implementa reconciliación automática si algún día alguien timbra fuera de LiftGo en la misma serie. Confirmaste que la serie es exclusiva.
- No se toca el módulo de facturas de proveedor (esas usan folio del proveedor, no nuestro).

## Consideraciones y trade-offs

- **Ventaja principal**: cero desalineación con Facturapi, cero swaps, cero riesgo de colisión.
- **Cambio visual**: los usuarios verán borradores con prefijo distinto (`BORRADOR-` vs `FAC-`). Es un beneficio (distingue claramente lo fiscal de lo no fiscal), pero requiere comunicarlo.
- **Sin regresión de idempotencia**: la secuencia `invoice_number_seq` se conserva para el modo stub y no se corrompe.
- **Reversible**: si algún día se decide volver al esquema anterior, basta con re-poblar `invoice_number` desde `next_invoice_number()` y restaurar el hook.

## Changelog

Entrada v6.107.0 (minor — cambio de comportamiento visible): "Folio interno de factura se asigna al timbrar tomando el folio de Facturapi como fuente de verdad. Borradores usan prefijo `BORRADOR-XXXX`."
