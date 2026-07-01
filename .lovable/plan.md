## Problema

La Edge Function `stamp-cfdi` (y las que comparten `_shared/facturapi/client.ts`) están cayendo con boot error:

```
Uncaught SyntaxError: Identifier 'binaryToText' has already been declared
  at supabase/functions/_shared/facturapi/client.ts:95:8
```

Por eso el cliente ve `Failed to send a request to the Edge Function` — la función ni siquiera arranca.

Causa: en el refactor anterior de `binaryToBytes` quedó `binaryToText` declarado dos veces en `client.ts` (líneas 125 y 132), idénticas.

## Cambio

1. Eliminar la segunda declaración duplicada de `binaryToText` en `supabase/functions/_shared/facturapi/client.ts` (líneas 131–136), dejando solo la de la línea 125.
2. Verificar con `rg` que quede una sola definición.
3. Agregar entrada patch al changelog: `v6.104.2` — "Fix boot error en Edge Functions de CFDI por identificador duplicado `binaryToText`".

Sin cambios de lógica ni de UI.
