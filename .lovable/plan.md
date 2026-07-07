## Problema

En la vista de detalle de factura hay un card rojo "Error de timbrado" (`InvoiceSummaryCards.tsx` línea 34) que renderiza `invoice.cfdi_error_message` **crudo**. El handler guarda ese campo como `desc.detail` — un JSON stringificado: `{"code":"invoice_stamping_failed","message":"...","errors":[{"code":"CFDI40148",...}],"logId":"..."}`. El usuario ve el blob JSON en pantalla en vez del mensaje traducido.

El `StampErrorDialog` (v6.107.5/6.107.6) ya traduce bien; este card es un canal distinto que se quedó atrás.

## Cambios

### 1. Nuevo helper `src/features/invoices/lib/formatStoredCfdiError.ts`

Toma el string almacenado, detecta si es JSON de Facturapi, extrae el `errors[0].code` (donde viene el CFDI40148 real — el `code` outer es el genérico `invoice_stamping_failed`), compone `"CODE: message"` y lo pasa por `classifyFacturapiError` para obtener el mensaje traducido.

Casos:
- JSON válido con `errors[]` → usa `errors[0].code + errors[0].message`.
- JSON válido sin `errors[]` → usa `parsed.code + parsed.message`.
- String plano → pasa directo al classifier.
- `null`/vacío → `null`.
- JSON malformado → usa el string original.

### 2. `InvoiceSummaryCards.tsx`

Sustituir `{cfdiErrorMessage}` por `{formatStoredCfdiError(cfdiErrorMessage)}`. Sin cambios de layout, solo el texto.

### 3. Tests

Crear `src/features/invoices/lib/__tests__/formatStoredCfdiError.test.ts`:

- Payload real (el JSON del usuario con `errors:[{code:"CFDI40148", message:"El campo DomicilioFiscalReceptor..."}]`) → mensaje traducido menciona "código postal".
- JSON sin `errors[]` pero con `code:"CFDI40147"` → menciona "razón social".
- String plano `"certificate expired"` → mensaje de CSD.
- `null` → `null`.
- JSON malformado `"{no es json"` → pasa el string al classifier (fallback unknown).

### 4. Validación en preview (Playwright)

Script en `/tmp/browser/stamp-error-card/verify.py`:
- Restaurar sesión Supabase.
- Navegar a `http://localhost:8080/invoices/bcada1b1-c25f-4e3b-869f-0fb99e11df92`.
- Esperar el card "Error de timbrado".
- Screenshot del card (element screenshot).
- Imprimir el `textContent` del párrafo del error.

Verificar que el texto ya NO contiene `{"code":` y SÍ contiene "código postal" o similar.

### 5. Changelog `v6.107.7` (patch, fix)

- Índice + detalle.
- Título: "Card de error de timbrado muestra mensaje traducido".
- Descripción: "El card rojo 'Error de timbrado' en la vista de factura ahora muestra el mensaje traducido al español (CFDI40148 → código postal, CFDI40147 → razón social) en vez del JSON crudo de Facturapi."

## Fuera de alcance

- No se altera lo que se guarda en `invoices.cfdi_error_message` (sigue siendo el JSON completo, útil para diagnóstico y logs).
- No se toca el handler edge ni el StampErrorDialog.
