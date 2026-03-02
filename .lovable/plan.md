

## Agregar cotizaciones de venta al modulo de cotizaciones

### Resumen
Actualmente el formulario de cotizaciones solo soporta renta (requiere periodo de fechas y calcula partidas con tarifas de renta). Se agregara un selector de tipo "Renta" o "Venta" que adapte el formulario y la logica segun el caso.

### Cambios en base de datos

**Migracion: agregar columna `quote_type` a la tabla `quotes`**

```sql
ALTER TABLE public.quotes
  ADD COLUMN quote_type text NOT NULL DEFAULT 'rental';

-- Las fechas start_date y end_date se vuelven opcionales para ventas
ALTER TABLE public.quotes
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL;
```

- `quote_type`: valor `'rental'` (default, compatibilidad con datos existentes) o `'sale'`
- Las fechas dejan de ser obligatorias a nivel DB porque en una venta no aplica periodo de renta

### Cambios en codigo

**1. `src/pages/QuoteForm.tsx`**

- Agregar estado `quoteType` (`'rental' | 'sale'`), con selector visual (tabs o radio group) al inicio del formulario
- Cuando `quoteType === 'rental'`: formulario actual sin cambios (fecha rango, selector de disponibilidad, calculo automatico de partidas)
- Cuando `quoteType === 'sale'`:
  - Ocultar `DateRangePickerField` (periodo de renta)
  - Mostrar selector de montacargas de toda la flota con estado `available` (sin filtro por fechas)
  - Mostrar campo "Precio de Venta" (input numerico) en lugar de calculo automatico
  - Las partidas se generan manualmente: una sola linea con descripcion `"{nombre} - Venta de equipo"`, cantidad 1, precio = precio ingresado
  - Al guardar: `start_date` y `end_date` se envian como la fecha actual (o null), `quote_type` = `'sale'`
- Al cambiar de tipo se limpian los campos especificos del otro tipo

**2. `src/pages/QuoteDetail.tsx`**

- Mostrar etiqueta "Tipo: Renta" o "Tipo: Venta" en la tarjeta de detalles
- Si es venta: ocultar la tarjeta "Fechas" (o mostrar solo la fecha de cotizacion) y ocultar el boton "Convertir a Reserva" (no aplica para ventas)
- Mantener el boton "Convertir a Factura" para ambos tipos

**3. `src/pages/QuotesPage.tsx`**

- Agregar indicador visual del tipo en la tabla (columna o badge sutil junto al numero)

**4. `src/components/QuotePDFButton.tsx`**

- Adaptar el titulo del PDF: "COTIZACION DE VENTA" cuando `quote_type === 'sale'`
- Si es venta: no mostrar "Periodo" en la seccion de detalles

**5. `src/lib/constants.ts`**

- Agregar labels: `rental: "Renta"`, `sale: "Venta"` al mapa de etiquetas

### Flujo de usuario para cotizacion de venta

1. Ir a Cotizaciones > Nueva Cotizacion
2. Seleccionar tipo "Venta"
3. Seleccionar montacargas disponible
4. Ingresar precio de venta
5. Seleccionar cliente
6. Ajustar IVA y vigencia si es necesario
7. Guardar

### Lo que NO cambia
- La tabla `quotes` mantiene todos sus campos actuales (compatibilidad total)
- Las cotizaciones existentes se mantienen como tipo `rental` por default
- El flujo de renta no se modifica en absoluto
- RLS policies no requieren cambios (misma tabla)

