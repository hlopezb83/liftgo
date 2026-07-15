## Problema

Al timbrar `/invoices/fcd686e8-...` la edge function `stamp-cfdi` devuelve `500 Internal server error`. El toast del cliente lo muestra como "Error al timbrar CFDI".

## Causa raíz

En `supabase/functions/stamp-cfdi/handler.ts` línea 160:

```ts
const { apiKey } = await getFacturapiConfig(supabase, deps.env, { ... });
```

Solo se destructura `apiKey`, pero `getFacturapiConfig` devuelve `{ mode, apiKey }` y el handler usa `mode` en dos lugares:

- Línea 179 (rama stub): `facturapi_env: mode === "live" ? "live" : "test"`
- Línea 404 (rama real): mismo campo tras timbrar en Facturapi

Como `mode` no está definido en scope, se lanza `ReferenceError` **después** de que Facturapi ya timbró el CFDI. El `catch` externo lo convierte en el genérico `"Internal server error"` con status 500. Es un bug introducido cuando se movió la resolución del modo al helper compartido — el handler nunca se actualizó para leer el `mode` devuelto.

## Fix

Cambiar la línea 160 para destructurar también `mode`:

```ts
const { apiKey, mode } = await getFacturapiConfig(supabase, deps.env, {
  modeOverride: (co.facturapi_mode as string | undefined) ?? null,
});
```

Sin otros cambios: el resto del handler ya consume `mode` correctamente.

## Verificación

- Correr los tests Deno existentes de `stamp-cfdi` (`index_test.ts`) que ejercitan tanto rama stub como rama Facturapi.
- Confirmar que la factura afectada (`fcd686e8-...`) queda en estado consistente. Si el timbrado real ya se ejecutó en Facturapi antes del `ReferenceError`, revisar `cfdi_status`/`cfdi_uuid` en DB — puede haber quedado en `stamping` sin `cfdi_uuid`, requiriendo un reset manual (`cfdi_status='pending'`) para reintentar, o si Facturapi ya devolvió UUID, hidratar los campos vía consulta puntual.

## Changelog

Añadir `v7.71.3` (patch) en `public/changelog.json` y `public/changelog/v7.71.3.json` describiendo el fix del ReferenceError en `stamp-cfdi`.
