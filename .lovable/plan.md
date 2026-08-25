# Validación del paquete fix-01 (C-1, C-2, H-5, H-6, H-7)

Revisé los 5 parches contra el código y la base de datos reales. Tres se aplican tal cual, uno necesita cambio de enfoque y otro no puede aplicarse hoy sin limpiar datos.

## Estado verificado

| Fix | ¿Bug real? | Veredicto |
|-----|-----------|-----------|
| C-1a tasa de IVA por línea | Sí | Aplicar tal cual |
| C-1b varianza BL-A5 → error 502 | Parcial | Aplicar con corrección importante |
| C-2 candado de factura timbrada | Sí, no existe el trigger | Aplicar |
| H-5 NC neto de pagos | Sí, la función no descuenta pagos | Requiere tu decisión de negocio |
| H-6 índice único de factura manual | Sí, pero hay 12 bookings duplicados | Bloqueado: limpiar datos primero |
| H-7 candado de CxP pagada | Sí, no existe el trigger | Aplicar |

Detalles de lo confirmado:
- `stamp-cfdi/handler.ts` usa `taxRateFraction` de la factura para todas las líneas, mientras que `invoiceTotals.ts` ya respeta `item.tax_rate` por línea. Una factura con líneas exentas o al 8% se timbra mal.
- En `public.invoices` no existe ningún trigger que bloquee editar líneas/montos de una factura ya timbrada; los triggers actuales cubren cancelación, metadatos fiscales y totales, no inmutabilidad.
- Hay 37 facturas timbradas sin cancelación aceptada que quedarían bajo el nuevo candado.
- `enforce_credit_note_max` hoy solo compara contra `invoices.total`, sin restar pagos. La tabla `payments` sí tiene `invoice_id` y `amount`.
- Consulta ejecutada: existen **12 bookings con más de una factura manual activa**. El índice único de H-6 fallaría al crearse.
- No existe `trg_lock_paid_supplier_bill` en `supplier_bills`.

## Corrección necesaria en C-1b (riesgo fiscal)

El parche, al detectar varianza, responde 502 y marca `cfdi_status='error'` **sin guardar `cfdi_uuid` ni el XML**. Pero para ese momento el CFDI ya fue timbrado ante el SAT: quedaría un comprobante vivo que la app no conoce y que nadie podría cancelar desde el sistema.

Propuesta: mantener el endurecimiento, pero **persistiendo siempre la identidad fiscal**. Al detectar varianza se guardan `cfdi_uuid`, `cfdi_xml`, URLs, `facturapi_invoice_id`, `stamp_variance*`, con `cfdi_status='error'` y mensaje explicativo, y se responde 502 para que el operador cancele/corrija. Así se bloquea el flujo sin perder el rastro del CFDI.

## Decisión pendiente: H-5

Restar los pagos del tope de notas de crédito impide emitir una NC de devolución sobre una factura ya cobrada, que es un caso legítimo (reembolso al cliente). Dos opciones:

- **A (como el parche):** tope = total − pagos. Bloquea NC sobre lo ya cobrado.
- **B (recomendada):** tope sigue siendo el total de la factura, pero se advierte en la UI cuando la NC excede el saldo pendiente, y se conserva la validación con `round(...,2)` actual en vez de la tolerancia `+0.01`.

## H-6: limpieza previa

Antes del índice único hay que resolver los 12 bookings con factura manual duplicada. Propongo entregar primero un reporte de esos casos (folios, montos, estatus) para que decidas cuál conservar; el índice se crea en una segunda entrega, ya sin duplicados.

## Alcance propuesto para esta entrega

1. C-1a: tasa por línea en el payload de Facturapi.
2. C-1b: varianza bloqueante, con persistencia del UUID.
3. C-2: migración del trigger `lock_stamped_invoice_edits`.
4. H-7: migración del trigger `lock_paid_supplier_bill_with_payments`.
5. H-5 según la opción que elijas.
6. H-6: solo el reporte de duplicados (sin migración).

## Detalles técnicos

- `supabase/functions/stamp-cfdi/handler.ts`: tipo de línea con `tax_rate?`, cálculo `lineRatePct` con fallback a la tasa de factura, y rama de varianza reescrita.
- Migraciones nuevas siguiendo tus reglas: `SET search_path = public`, sin `USING (true)`, sin tablas nuevas (no requieren GRANT/RLS adicionales).
- Pruebas: casos de líneas con tasa 0/8/16 en las pruebas del handler, y suites SQL de humo para los dos triggers nuevos.
- Cierre: entrada **minor v7.333.0** en `CHANGELOG.md`, `public/changelog.json`, `public/changelog/v7.333.0.json`, `public/version.json` y `package.json`.
