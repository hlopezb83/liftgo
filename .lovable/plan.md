
## Permitir multiples equipos en cotizaciones de renta

### Problema actual
El formulario de cotizacion de renta solo permite seleccionar un montacargas (`forkliftId` es un string unico). El usuario necesita cotizar varios equipos en una sola cotizacion.

### Solucion

Cambiar el estado de seleccion de un solo `forkliftId` a un arreglo `forkliftIds: string[]`, y generar line items combinados de todos los equipos seleccionados.

### Cambios tecnicos

**1. `src/pages/QuoteForm.tsx`** (archivo principal)
- Cambiar `forkliftId: string` a `forkliftIds: string[]`
- Actualizar `lineItems` memo para iterar sobre todos los forklifts seleccionados, llamando `generateLineItems()` por cada uno y concatenando los resultados
- Actualizar la validacion: verificar que `forkliftIds.length > 0` en lugar de `!!forkliftId`
- En el payload, guardar `forklift_id` como el primero del arreglo (por compatibilidad con la columna existente que es un solo UUID) o null
- Ajustar la carga de cotizacion existente para restaurar los forklifts seleccionados
- Reemplazar el componente `ForkliftSelector` unico por una seccion que permita agregar/quitar equipos

**2. `src/components/ForkliftSelector.tsx`** (modificar o crear nuevo componente)
- Convertir en un componente de seleccion multiple, similar a como funciona `SaleLineItems`:
  - Lista de equipos seleccionados con boton para remover cada uno
  - Selector para agregar otro equipo (filtrando los ya seleccionados)
  - Boton "Agregar equipo"
- Mantener la logica de deshabilitar si no hay fechas seleccionadas

**3. `src/lib/invoiceUtils.ts`** (sin cambios)
- La funcion `generateLineItems(forklift, start, end)` ya funciona por equipo individual
- Solo se llamara multiples veces desde el QuoteForm

### Compatibilidad con datos existentes
- La tabla `quotes` tiene una columna `forklift_id` (uuid unico). Se mantendra guardando el primer equipo seleccionado ahi por compatibilidad
- Los `line_items` (jsonb) ya soportan multiples items, asi que multiples equipos se reflejan naturalmente en las partidas
- Al editar una cotizacion existente de renta, se reconstruiran los `forkliftIds` buscando coincidencias entre las descripciones de los line items y los nombres de los forklifts

### Flujo del usuario
1. Selecciona tipo "Renta"
2. Selecciona periodo de renta
3. Selecciona primer equipo del dropdown
4. Click "Agregar otro equipo" para seleccionar mas
5. Puede remover equipos individuales
6. El resumen de costos muestra las partidas de todos los equipos combinados

### Consideraciones
- Los equipos ya seleccionados se filtran del dropdown para evitar duplicados
- La disponibilidad se sigue validando con las fechas seleccionadas
- El formato de descripcion de cada equipo en los line items ya incluye el nombre del montacargas (`"MTC-007 -- Renta mensual"`)
