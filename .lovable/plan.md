

## Restringir IVA a 11% y 16% en toda la aplicacion

### Problema
Actualmente el campo de IVA es un input numerico libre donde se puede escribir cualquier valor. En Mexico solo existen dos tasas de IVA: 11% (franja fronteriza) y 16% (resto del pais).

### Solucion

Centralizar las opciones de IVA en la configuracion global y reemplazar todos los inputs numericos de IVA por un selector (dropdown) con solo dos opciones: 11% y 16%, con 16% como valor predeterminado.

### Cambios

**1. `src/lib/config.ts`** - Agregar opciones de IVA

Agregar al objeto `APP_CONFIG`:
```text
TAX_RATE_OPTIONS: [
  { value: 16, label: "16% (General)" },
  { value: 11, label: "11% (Frontera)" },
]
```

**2. `src/components/TotalsSummary.tsx`** - Cambiar input libre por Select

- Reemplazar el `<Input type="number">` por un `<Select>` con las dos opciones de IVA
- Cuando `onTaxRateChange` esta presente, mostrar el dropdown
- Cuando no esta presente (modo lectura), seguir mostrando el texto "IVA (16%)"

**3. `src/pages/QuoteForm.tsx`** - Cambiar input de IVA por Select

- Reemplazar el `<Input type="number">` del campo "IVA (%)" por un `<Select>` con las dos opciones
- El estado `taxRate` ya esta inicializado en "16", se mantiene igual

**4. `src/pages/InvoiceForm.tsx`** - Sin cambios directos

- Ya usa `TotalsSummary` con `onTaxRateChange`, asi que el cambio en `TotalsSummary` lo cubre automaticamente

### Archivos afectados
- `src/lib/config.ts` (agregar opciones)
- `src/components/TotalsSummary.tsx` (input -> select)
- `src/pages/QuoteForm.tsx` (input -> select)

### Lo que NO cambia
- La logica de calculo en `invoiceUtils.ts` (recibe el numero y calcula igual)
- Los valores almacenados en la base de datos (sigue siendo un numero)
- Los PDFs (muestran el porcentaje que viene de la DB)
- Las cotizaciones y facturas existentes con 16% se mantienen sin cambios
