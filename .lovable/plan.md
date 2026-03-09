

# Fix: Datos precargados en edición de montacargas

## Problema
Cuando se edita un montacargas, los campos Fabricante y Modelo aparecen vacíos porque:
1. Los `<Select>` solo muestran opciones de `equipment_models`. Si `existing` carga antes que `equipmentModels`, el formulario se llena pero las opciones del Select aún no existen, y el valor no se muestra.
2. El `useEffect` que llena el formulario depende solo de `[existing]`, sin esperar a que `equipmentModels` esté disponible.

## Solución

### `src/pages/ForkliftForm.tsx`
- Cambiar la dependencia del `useEffect` de `[existing]` a `[existing, equipmentModels]` para que el formulario se llene cuando ambos datos estén disponibles.
- Agregar lógica de fallback: si el fabricante/modelo del forklift existente no se encuentra en `equipment_models`, incluirlo como opción adicional en los arrays `manufacturers` y `filteredModels` para que el Select pueda mostrar el valor guardado.
- Esto evita que los campos aparezcan como "Seleccionar fabricante" cuando ya tienen un valor almacenado.

### Archivos a modificar
- `src/pages/ForkliftForm.tsx` (único archivo)

