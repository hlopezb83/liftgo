

## Ordenar tabla de facturas por # de factura de forma predeterminada

### Cambio

**Archivo: `src/pages/InvoicesPage.tsx`**

En el hook `useSort`, agregar valores predeterminados para que la tabla se ordene por `invoice_number` en orden descendente (factura más reciente primero):

```typescript
const { sortKey, sortDirection, toggleSort, sortedItems } = useSort(filtered, {
  defaultKey: "invoice_number",
  defaultDirection: "desc",
  accessors: { ... },
});
```

Un solo cambio, dos líneas añadidas.

