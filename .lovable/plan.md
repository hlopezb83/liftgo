## Contexto

Auditoría integral (61 hallazgos). Arrancamos por los 2 CRÍTICOS. Verificado en BD: hoy **100% de facturas y pagos están en MXN** (52 pagos / 87 facturas, todos MXN). El flujo USD está latente en el schema y en la UI pero no se usa en producción → C-1 se resuelve con un **fix defensivo** (rechazar el problema, no migrar histórico).

---

## C-2. Cancelación CFDI sin llamar al SAT

**Archivo**: `supabase/functions/cancel-cfdi/handler.ts` (líneas 107-152)

Hoy, si falta `apiKey` **o** `facturapi_invoice_id`, la función marca la factura como `cancelled` sin tocar el SAT (`satStatus = "accepted"` por default). `stamp-cfdi` sí tiene la guarda BL-20 en modo live; `cancel-cfdi` no.

### Cambios

1. **Leer también `mode` desde `getFacturapiConfig`** (ya existe el helper, se usa igual que en stamp-cfdi:188).
2. **Guarda modo live sin API key**: si `mode === "live"` y `!apiKey` → `400` con mensaje "Facturapi API key no configurada para modo live. No se canceló ante el SAT." — NO se actualiza la factura.
3. **Guarda live con UUID pero sin `facturapi_invoice_id`**: si `mode === "live"` y hay `cfdi_uuid` pero falta `facturApiId` → `409` con "CFDI emitido fuera de Facturapi; cancelar manualmente en el portal del PAC/SAT y usar acción administrativa para reconciliar" — NO se actualiza.
4. **Modo test/stub explícito**: solo si `mode !== "live"` se permite la ruta stub, y la respuesta devuelve `stub: true` (paralelo a stamp-cfdi:229) para que la UI lo pinte.
5. **UI**: `InvoiceCancellationDialog` (o equivalente) muestra un badge "Cancelación simulada (modo prueba)" cuando la respuesta trae `stub: true`. Localizar el componente durante implementación (`rg -l "cancel-cfdi"` en `src/`).

### Tests

- `supabase/functions/cancel-cfdi/index_test.ts` (ya existe): agregar casos
  - live + sin apiKey → 400, factura intacta
  - live + apiKey + sin facturapi_invoice_id → 409, factura intacta
  - test + sin apiKey → 200 `stub: true`, factura `cancelled`
  - live + apiKey + facturapi_invoice_id + Facturapi acepta → 200, factura `cancelled` (regresión del happy path)

---

## C-1. Multi-moneda defensivo

**Contexto real**: 0 pagos y 0 facturas en divisa distinta a MXN. No hay valor en normalizar histórico. El riesgo es que la UI ya permite elegir divisa y en cuanto alguien emita una factura USD, el trigger de saldo la marca pagada con un pago MXN.

### Cambios

1. **Migración**: nuevo trigger `BEFORE INSERT OR UPDATE ON public.payments` que valida:
   ```
   IF NEW.currency IS DISTINCT FROM (SELECT moneda FROM invoices WHERE id = NEW.invoice_id)
     THEN RAISE EXCEPTION 'Pago en % no coincide con la divisa de la factura (%). Conversión multi-moneda aún no soportada.'
   ```
   Trata `NULL` como `'MXN'` en ambos lados (compatibilidad con filas históricas sin `moneda`).
2. **Frontend** (`src/features/invoices/hooks/invoices/useRecordPaymentForm.ts` y su form): forzar el `currency` del pago al `moneda` de la factura seleccionada; deshabilitar el selector de divisa con tooltip "Se aplica en la divisa de la factura. Multi-moneda próximamente." No se remueve la columna (retro-compatibilidad).
3. **Test unitario**: agregar a `src/test/` (o al hook) un caso que valide que `useRecordPaymentForm` inicializa `currency` con el `moneda` de la factura y no permite cambiarlo.
4. **Changelog** explícito: documentar que multi-moneda queda bloqueada intencionalmente hasta implementar la ruta formal (`amount_doc` normalizado + reconciliación de triggers).

### Lo que NO se toca en este sprint

- No se agrega `amount_doc`, no se migra el trigger de saldo, no se toca `v_invoices_with_balance`. Todo eso queda para cuando el negocio realmente necesite facturar USD (Sprint fiscal futuro).
- REPs multi-moneda (BL-M5) fuera de alcance.

---

## Changelog

Nueva entrada `v7.113.0` (minor por la guarda de seguridad y el trigger de BD):

- **Fix crítico** — cancel-cfdi: guarda anti-stub en modo live (C-2).
- **Fix crítico** — pagos: rechazar pagos en divisa distinta a la factura hasta soportar conversión formal (C-1 defensivo). UI fuerza la divisa de la factura.

## Fuera de alcance

- Resto de la auditoría (14 altos, 23 medios, 22 bajos). Se abordan en sprints posteriores según el roadmap del reporte.
