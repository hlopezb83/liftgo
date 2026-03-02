

## Corregir formato de moneda mexicana en PDFs de cotizaciones y facturas

### Problema
Los montos en los PDFs se formatean con `.toFixed(2)` sin separador de miles, mostrando por ejemplo `$1234.50` en lugar de `$1,234.50`. Esto aplica tanto al PDF de cotizaciones como al de facturas.

### Solucion
Crear una funcion auxiliar de formateo para PDFs y aplicarla en ambos componentes.

### Cambios

**1. `src/components/QuotePDFButton.tsx`**

Agregar funcion local de formateo y reemplazar todas las ocurrencias de `$${Number(x).toFixed(2)}`:

- Linea 107: precio unitario en tabla
- Linea 108: total por partida en tabla
- Linea 121: subtotal
- Linea 125: monto de IVA
- Linea 136: total general

Formato nuevo: `Number(x).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` con prefijo `$`.

Ejemplo: `$1234.50` se convierte en `$1,234.50`

**2. `src/components/InvoicePDFButton.tsx`**

Aplicar el mismo cambio en las lineas equivalentes:

- Linea 118: precio unitario en tabla
- Linea 119: total por partida en tabla
- Linea 127: subtotal
- Linea 131: monto de IVA
- Linea 139: total general

### Detalle tecnico

Se usara una funcion auxiliar dentro de cada componente:

```typescript
const fmtMXN = (n: number) =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
```

Esto reemplaza `$${Number(x).toFixed(2)}` en ambos archivos, produciendo montos con separador de miles correcto para Mexico.

### Alcance
- 2 archivos modificados
- Sin cambios en base de datos
- Consistencia visual entre PDF de cotizaciones y facturas
