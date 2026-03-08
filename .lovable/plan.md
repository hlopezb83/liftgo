

## Plan: Agregar RFC y C.P. en la tarjeta de Cliente del detalle de cotización (v3.19.0)

### Cambio

**`src/pages/QuoteDetail.tsx`** (líneas ~235-238)

Usar el array `customers` (ya cargado en línea 44) para buscar el cliente por `quote.customer_id` y mostrar su `rfc` y `domicilio_fiscal_cp` debajo del nombre en la tarjeta de Cliente.

```tsx
// De:
<CardContent><p className="font-medium">{quote.customer_name || "—"}</p></CardContent>

// A:
<CardContent>
  <p className="font-medium">{quote.customer_name || "—"}</p>
  {customerMatch?.rfc && <p className="text-sm text-muted-foreground">RFC: {customerMatch.rfc}</p>}
  {customerMatch?.domicilio_fiscal_cp && <p className="text-sm text-muted-foreground">C.P. {customerMatch.domicilio_fiscal_cp}</p>}
</CardContent>
```

Donde `customerMatch` se obtiene con un `useMemo` que busca en `customers` por `quote.customer_id`.

**`src/lib/changelog.ts`** — v3.19.0

### Archivos
- **Editar**: `src/pages/QuoteDetail.tsx`, `src/lib/changelog.ts`

