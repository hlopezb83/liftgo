

# Fix: Inputs cortados en el diálogo de prospecto

## Problema
El `ScrollArea` tiene `pr-4` aplicado en el componente raíz, pero el contenedor interno (viewport) del ScrollArea no respeta ese padding correctamente, causando que los inputs se recorten o desborden.

## Solución
Mover el `pr-4` del `ScrollArea` al `div` interno que contiene los campos del formulario, para que el padding se aplique dentro del viewport scrollable y los inputs tengan espacio suficiente sin recortarse.

## Archivo: `src/components/crm/ProspectFormDialog.tsx`
- Línea 147: Quitar `pr-4` del `ScrollArea`
- Línea 148: Agregar `pr-4` al `div` interno (`space-y-4 pb-1` → `space-y-4 pb-1 pr-4`)

