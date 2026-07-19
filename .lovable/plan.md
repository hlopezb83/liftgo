## Auditoría del Sprint 1 (v7.87.0)

Revisé los archivos tocados en Sprint 1 y encontré **3 bugs residuales** y **cobertura de tests incompleta**. Antes de arrancar Sprint 2, propongo un mini-sprint de cierre (v7.87.1) + Sprint 2 (v7.88.0).

---

### Bugs residuales del Sprint 1

**A · `stamp-cfdi` y `stamp-credit-note`: el outer-catch no libera el claim.**
En ambos handlers, el `catch (err)` final (final del archivo) retorna 500 sin llamar `releaseClaim`. Si algo entre el claim atómico y la primera llamada a Facturapi lanza (p. ej. `getFacturapiConfig`, `company_settings` malformado, error de red al `storage`), la factura/NC queda para siempre en `cfdi_status='stamping'` — exactamente el bug BL-03 que dijimos haber cerrado.

**B · `stamp-payment-complement`: NumParcialidad no incrementa al re-timbrar tras cancelación.**
Al re-timbrar un pago cancelado, el loop hace `if (p.id === payment_id) continue`, saltándose la emisión cancelada previa del propio pago. Como `cancel-payment-complement` no limpia `rep_cfdi_uuid`, esa emisión sí existe ante el SAT — pero no la contamos. Resultado: `installmentNumber` reutiliza el número anterior y el SAT rechaza. La corrección BL-06/07 quedó parcial: hay que sumar `+1` cuando el pago actual tiene `rep_cfdi_uuid` no nulo (estaba timbrado).

**C · `stamp-payment-complement`: filtro del claim demasiado laxo.**
Actualmente `.in("rep_cfdi_status", ["pending","error","none","cancelled"])` sin `.is("rep_cfdi_uuid", null)`. Bien para re-timbrado tras cancel, pero abre una puerta: un pago `pending` con `rep_cfdi_uuid` accidentalmente poblado (data corrupta) pasaría el claim. Blindar con condición `rep_cfdi_status='cancelled' OR rep_cfdi_uuid IS NULL`.

**D · BL-11 solo client-side.**
Bloqueamos sobrepago en `useRecordPaymentForm`, pero dos pestañas concurrentes pueden pasar la validación. Falta la red de seguridad server-side (mismo patrón que BL-08).

---

### Tests que faltan

- `stamp-cfdi/handler_test.ts`: **BL-01** (tax_rate=0 → 0% timbra), **BL-02** (discount % y $ → payload Facturapi), **BL-03** (fallo antes de Facturapi → `cfdi_status=error`), **BL-20** (folio no numérico se ignora sin romper payload).
- `stamp-credit-note/handler_test.ts`: **BL-08** (NCs acumuladas > total → 400 + release), **BL-16** (payment_method PPD y currency USD propagados desde factura origen).
- `stamp-payment-complement/index_test.ts`: **BL-06/07** (re-timbrado tras cancelación asigna installment N+1; sobrepago rechazado), **BL-05** (related_doc.currency=USD cuando factura USD).
- `syncInvoiceStatus.test.ts`: **BL-10** (invoice.status='cancelled' → no update; status='draft' → no update).
- `useRecordPaymentForm.test.ts`: **BL-11** (amt > balance → notifyValidation, no createPayment).

---

### Plan de ejecución

**Fase 1 — v7.87.1 (mini-sprint de cierre, patch)**

1. `stamp-cfdi/handler.ts`: outer-catch llama `releaseClaim("Internal error")` antes del return 500.
2. `stamp-credit-note/handler.ts`: mismo blindaje en outer-catch.
3. `stamp-payment-complement/index.ts`:
   - Cambiar el filtro del claim a `.or("rep_cfdi_uuid.is.null,rep_cfdi_status.eq.cancelled")` combinado con el `.in([...])`.
   - En el loop de emisiones, contar `+1` cuando `p.id === payment_id && p.rep_cfdi_uuid !== null` (emisión propia cancelada).
4. **Migración**: trigger `BEFORE INSERT/UPDATE` en `payments` que rechace si la suma total (excluyendo cancelados si es que existe columna, o simplemente todos los pagos activos) excede `invoices.total + 0.01`. Red de seguridad BL-11 y protección contra concurrencia.
5. Agregar los tests listados arriba.
6. Actualizar `public/changelog.json` + `public/changelog/v7.87.1.json`.

**Fase 2 — v7.88.0 (Sprint 2)**

Sigue el plan original: **BL-09** (NCs en Estado de Resultados), **BL-12** (prorratear primer mes recurrente), **BL-13** (autocompletar reserva al devolver), **BL-14** (timezone en `rentalCalculation`), **BL-15** (cap 29–30 días al mes completo).

---

### Notas técnicas para la corrección A/B

- El `releaseClaim` es una closure declarada dentro del `try` — en el outer-catch queda accesible sólo si movemos la declaración antes del `try` o usamos un try/catch inline. La forma más limpia: declarar `releaseClaim` como función local (no dentro del `try`) y capturar `invoice_id` como `let` en scope externo.
- Para BL-06/07 el fix es una línea:
  ```ts
  const currentPaymentAlreadyEmitted =
    payment.rep_cfdi_uuid != null; // stamped or cancelled con uuid
  const installmentNumber = priorEmissions + (currentPaymentAlreadyEmitted ? 1 : 1);
  // …contar current en priorEmissions si tenía uuid
  ```

¿Ejecuto la Fase 1, valido con tests verdes, y sigo a Sprint 2?