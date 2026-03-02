
## Usar datos del equipo asignado al facturar cotizaciones de venta

### Problema
Al convertir una cotizacion de venta aceptada a factura (`/invoices/new?from_quote=...`), el formulario copia los `line_items` de la cotizacion tal cual, que contienen descripciones genericas como "Yale GLP050 - Venta de equipo". No utiliza los datos del equipo especifico ya asignado (nombre, numero de serie).

### Solucion

Modificar el `useEffect` de pre-llenado en `InvoiceForm.tsx` para que, cuando la cotizacion de origen sea de tipo venta y tenga equipos asignados, reemplace las descripciones de cada linea con los datos reales del montacargas asignado.

### Cambios tecnicos

**1. `src/pages/InvoiceForm.tsx`**
- Importar `useQuoteAssignments` desde `useAssignForklifts`
- Llamar `useQuoteAssignments(fromQuoteId)` para obtener las asignaciones existentes
- Importar `useForklifts` (ya existe en el archivo)
- En el `useEffect` que pre-llena desde `sourceQuote`:
  - Detectar si `sourceQuote.quote_type === "sale"` y hay asignaciones
  - Por cada linea, buscar si hay un equipo asignado con ese `line_index`
  - Si lo hay, buscar el forklift en la lista de forklifts y reemplazar la descripcion con datos especificos:
    - Formato: `"{manufacturer} {model} — S/N: {serial_number} ({name}) - Venta de equipo"`
  - Mantener precio, cantidad y demas campos CFDI intactos

### Ejemplo del resultado

Antes (descripcion del line item en factura):
```
Yale GLP050 - Venta de equipo
```

Despues (con equipo asignado):
```
Yale GLP050 — S/N: FG12345 (MTC-007) - Venta de equipo
```

### Consideraciones
- Si una linea no tiene equipo asignado, se mantiene la descripcion original de la cotizacion
- Solo aplica cuando `quote_type === "sale"` — las cotizaciones de renta no se ven afectadas
- Los campos financieros (precio, cantidad, totales) no se modifican
