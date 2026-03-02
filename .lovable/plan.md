
## Asignar equipos del inventario a cotizaciones de venta aceptadas

### Contexto
Actualmente, las cotizaciones de venta solo referencian **modelos de equipo** (ej. "Yale GLP050 - Venta de equipo"), pero no permiten vincular un equipo especifico del inventario (con su ID, numero de serie, nombre). Al aceptar la cotizacion, no hay forma de indicar cual montacargas fisico se vendera.

### Solucion propuesta

Agregar un paso de **"Asignacion de Equipos"** en el detalle de la cotizacion de venta, visible cuando el estado es `accepted`. Esto permite seleccionar montacargas disponibles del inventario que coincidan con el modelo cotizado.

### Flujo del usuario
1. Se crea una cotizacion de venta con modelos y cantidades
2. Se envia al cliente y se marca como "Aceptada"
3. En el detalle de la cotizacion aceptada, aparece una nueva seccion **"Asignar Equipos"**
4. Por cada linea de venta, el usuario selecciona los montacargas especificos del inventario (filtrados por modelo/fabricante y con status `available`)
5. Al confirmar la asignacion, los montacargas seleccionados se marcan como `sold` y se registra la relacion

### Cambios tecnicos

**1. Nueva tabla `quote_assigned_forklifts` (migracion)**
```text
- id: uuid (PK)
- quote_id: uuid (FK -> quotes)
- forklift_id: uuid (FK -> forklifts)
- line_index: integer (cual linea del quote)
- created_at: timestamptz
```
Con RLS siguiendo el patron existente (admin, dispatcher, administrativo full access; auditor/mechanic read).

**2. Nuevo componente `AssignForkliftsCard`**
- Se muestra en `QuoteDetail.tsx` solo cuando `isSale && quote.status === "accepted"`
- Parsea las `line_items` para extraer fabricante/modelo de cada linea
- Para cada linea, muestra un selector con los montacargas disponibles que coincidan (filtrando por `manufacturer` y `model` en la tabla `forklifts`, status `available`)
- Boton "Confirmar Asignacion" que:
  - Inserta los registros en `quote_assigned_forklifts`
  - Actualiza el status de cada montacargas a `sold`
  - Registra en `status_logs` el cambio de estado

**3. Hook `useAssignForklifts`**
- Query para obtener asignaciones existentes de un quote
- Mutation para asignar (insert en tabla + update forklifts a `sold` + insert status_logs)

**4. Actualizacion de `QuoteDetail.tsx`**
- Importar y renderizar `AssignForkliftsCard` debajo de las notas cuando aplique
- Si ya hay equipos asignados, mostrarlos como lista de solo lectura con nombre y numero de serie

### Consideraciones
- Un montacargas solo puede asignarse a una cotizacion (constraint unique en forklift_id)
- El filtro de equipos disponibles usa `manufacturer` + `model` de la tabla `forklifts` comparado con la descripcion del line item
- Si la cantidad cotizada es mayor que los equipos disponibles de ese modelo, se muestra un aviso pero no se bloquea la asignacion parcial
- La asignacion es reversible: un boton "Desasignar" devuelve el montacargas a status `available`
