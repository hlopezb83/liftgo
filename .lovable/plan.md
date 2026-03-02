

## Usar modelos de equipo en cotizaciones de venta

### Problema
Actualmente, al crear una cotizacion de venta, el dropdown muestra las unidades individuales de la flota (MC-001, MC-002, etc.). Para ventas, lo correcto es cotizar por modelo de equipo (ej. "Hyster H50"), no por unidad especifica.

### Solucion

Cambiar el selector de montacargas en modo "Venta" para que muestre los modelos de equipo configurados en la tabla `equipment_models`, en lugar de unidades individuales.

### Cambios en base de datos

**Migracion: agregar columna `equipment_model_id` a la tabla `quotes`**

```text
quotes
  + equipment_model_id (uuid, nullable, FK -> equipment_models.id)
  forklift_id (ya es nullable, se usara solo para rentas)
```

La columna `forklift_id` se mantiene para cotizaciones de renta. Para ventas, se usara `equipment_model_id`.

### Cambios en codigo

**1. `src/pages/QuoteForm.tsx`**

- Importar `useEquipmentModels` en lugar de `useForklifts` para modo venta
- Nuevo estado `equipmentModelId` para almacenar el modelo seleccionado
- Reemplazar el `ForkliftSelector` en modo venta por un nuevo selector que muestre modelos (formato: "Fabricante - Modelo")
- La partida de la cotizacion usara la descripcion del modelo: `"Hyster H50 - Venta de equipo"`
- Al guardar en modo venta: enviar `equipment_model_id` en lugar de `forklift_id` (forklift_id sera null)
- Al editar una cotizacion de venta existente: cargar el `equipment_model_id`

**2. Nuevo componente: `src/components/EquipmentModelSelector.tsx`**

Dropdown que lista los modelos de `equipment_models`:
- Muestra: "Fabricante - Modelo" (ej. "Hyster - H50")
- Sin filtro de disponibilidad (los modelos no tienen estado)
- Siempre habilitado (no depende de fechas)

**3. `src/pages/QuoteDetail.tsx`**

- Cargar datos del modelo de equipo cuando la cotizacion es de venta
- Mostrar "Modelo: Hyster H50" en la tarjeta de detalles en lugar de una unidad especifica

**4. `src/components/QuotePDFButton.tsx`**

- Para cotizaciones de venta: obtener el nombre del modelo desde `equipment_models` si hay `equipment_model_id`
- Mostrar el nombre del modelo en el PDF

**5. `src/hooks/useQuotes.ts`**

- Ajustar validacion en `handleSubmit`: para ventas no requerir `forklift_id`, requerir `equipment_model_id`

### Flujo de usuario

1. Nueva Cotizacion > seleccionar "Venta"
2. El dropdown cambia a "Modelo de Equipo" y muestra: Hyster - H50, Toyota - 8FGU25, etc.
3. Seleccionar modelo, ingresar precio, cliente
4. La partida se genera como: "Hyster H50 - Venta de equipo"
5. Al guardar, se almacena `equipment_model_id` (sin `forklift_id`)

### Lo que NO cambia
- Cotizaciones de renta siguen usando `forklift_id` con unidades individuales
- La tabla `equipment_models` no se modifica
- RLS no requiere cambios (misma tabla quotes)

### Detalle tecnico

- 1 migracion de base de datos (agregar columna)
- 1 componente nuevo (`EquipmentModelSelector`)
- 4 archivos modificados
- Sin cambios en edge functions
