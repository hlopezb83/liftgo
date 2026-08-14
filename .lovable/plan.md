# Plan: Endurecer validación de tipo de cambio en stamp-payment-complement

## Contexto

El diff proporcionado está **obsoleto**: fue escrito contra una versión anterior del archivo que usaba `tipoCambio`/`payment.currency` y tenía un bloque guardia `if (payment.currency !== 'MXN' && (!payment.exchange_rate || Number(payment.exchange_rate) <= 0))` que devolvía 422. El código actual (refactorizado en v7.308.0) usa `paymentCurrency`/`paymentExchange` y **ya no tiene ese guardia**. El cambio literal del diff (forzar `MXN → 1`) es un no-op, porque `paymentExchange` ya solo se anexa al payload cuando `paymentCurrency !== "MXN"` (líneas 253-256), de modo que MXN ya se omite correctamente.

## Bug real residual

La edge function `stamp-payment-complement/index.ts` perdió su guardia defensiva y ya no valida que un pago en moneda extranjera tenga un tipo de cambio válido antes de enviarlo al PAC:

- `payments.exchange_rate` es `NUMERIC(14,6) NOT NULL DEFAULT 1` sin check constraint que exija TC > 0 cuando `currency ≠ MXN`.
- `index.ts` línea 218: `const paymentExchange = Number(payment.exchange_rate || 1);` — un pago USD con `exchange_rate = 1` (el default de columna, o un valor sembrado) pasaría silenciosamente y se timbraría con `tipoCambio = 1`, produciendo un CFDI fiscalmente incorrecto.
- El formulario `useRecordPaymentForm.ts` (líneas 114-122) sí valida `exchange_rate > 0` para moneda extranjera, así que los pagos creados por UI llegan correctos. El riesgo son pagos creados fuera del formulario (seed, inserción directa, migración, paths futuros) que saltan esa validación.

La edge function es la **última línea de defensa** antes del PAC; debe rechazar, no assumir.

## Cambios

### 1. `supabase/functions/stamp-payment-complement/index.ts`

Reemplazar las líneas 217-218 actuales:
```ts
const paymentCurrency = (payment.currency as string | null) || "MXN";
const paymentExchange = Number(payment.exchange_rate || 1);
```
por:
```ts
const paymentCurrency = (payment.currency as string | null) || "MXN";
// Moneda extranjera: el TC es obligatorio y > 0. El default de columna (1)
// para un pago USD produciría un CFDI con tipoCambio=1 → fiscalmente incorrecto.
// La edge function es la última defensa antes del PAC: rechazar, no asumir.
if (paymentCurrency !== "MXN") {
  const tc = Number(payment.exchange_rate);
  if (!Number.isFinite(tc) || tc <= 0) {
    await releaseClaim("Tipo de cambio inválido para moneda extranjera");
    return jsonError(
      req,
      422,
      "El Tipo de Cambio es obligatorio y debe ser mayor a 0 para pagos en moneda extranjera.",
    );
  }
}
const paymentExchange = paymentCurrency === "MXN"
  ? 1
  : Number(payment.exchange_rate);
```

Notas:
- El guardia libera el claim (`releaseClaim`) antes del early-return, igual que los demás early-returns no-fatales del archivo (líneas 176, 180, 186, 188).
- `paymentExchange === 1` para MXN es meramente defensivo (no se usa en el payload MXN), pero deja explícita la intención y elimina el `|| 1` que enmascaraba el caso erróneo.
- Para moneda extranjera, tras el guardia `tc > 0`, `Number(payment.exchange_rate)` es seguro (sin `|| 1`).

### 2. Test de regresión

Añadir caso(s) en el suite existente del edge function (`supabase/functions/stamp-payment-complement/`) verificando:
- Pago USD con `exchange_rate` nulo/0/cero → 422 con mensaje de TC obligatorio.
- Pago USD con `exchange_rate = 18.5` → pasa el guardia (no 422 por TC).
- Pago MXN (con o sin `exchange_rate`) → no recibe 422 por TC.

### 3. Consistencia (verificación, no cambio obligatorio)

Confirmar que `supabase/functions/stamp-cfdi/index.ts` (timbrado de facturas) ya valida el tipo de cambio para facturas en moneda extranjera. Si no lo hace, aplicar el mismo patrón de guardia. Se deja como verificación dentro del sprint; si ya está cubierto, no se toca.

## No se incluye

- No se añade check constraint a nivel DB en `payments.exchange_rate` (podría romper datos sembrados existentes y sale del alcance del diff). Se documenta como hardening futuro opcional.
- No se toca `computeRepExchange` (decisions.ts): esa lógica sobre EquivalenciaDR es correcta y tiene su propio test.

## Verificación

- `tsgo` typecheck del edge function (Deno).
- Ejecutar tests del edge function con `supabase--test_edge_functions` para `stamp-payment-complement`.
- Desplegar el edge function y, si es posible, curl de prueba con un pago USD sin TC → 422.
- Actualizar `public/changelog.json` y versión (patch: v7.320.6).
