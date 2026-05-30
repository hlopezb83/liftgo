## Corregir tests fallidos de quoteFormHelpers

**Problema:** 2 tests fallan porque asertan la firma vieja de `toast.error("mensaje")`, pero tras la migración a `notifyError` la llamada ahora es `toast.error("Error", { description: "mensaje", ... })`.

### Cambios

**`src/features/quotes/hooks/quoteForm/__tests__/quoteFormHelpers.test.ts`** (líneas 20 y 26)

Reemplazar:
```ts
expect(toastError).toHaveBeenCalledWith("Selecciona un cliente");
```
Por:
```ts
expect(toastError).toHaveBeenCalledWith(
  "Error",
  expect.objectContaining({ description: "Selecciona un cliente" }),
);
```

Y análogo para "Selecciona el periodo de renta".

### Verificación

- Re-ejecutar `vitest run src/features/quotes/hooks/quoteForm/__tests__/quoteFormHelpers.test.ts` y confirmar 7/7 pasan.
- Agregar entrada patch `6.15.3` a `public/changelog.json` + `public/changelog/v6.15.3.json` describiendo la corrección de los asserts.

Sin cambios de código de producción — solo asserts y changelog.