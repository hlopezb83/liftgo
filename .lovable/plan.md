

# Fix: Modelo no se mantiene al editar equipo

## Causa raíz

Hay una condición de carrera entre la carga de datos y el renderizado del Select de modelo:

1. El componente monta con `form.manufacturer = ""` y `form.model = ""`
2. `filteredModels` depende de `form.manufacturer`, así que es `[]` inicialmente
3. Cuando `existing` carga, el `useEffect` setea ambos campos simultáneamente
4. Pero el Select de modelo puede no reconocer el valor si sus opciones estaban vacías al momento de asignarlo

## Solución

Agregar una key al Select de modelo que incluya `form.manufacturer`, forzando a Radix a re-montar el componente cuando cambia el fabricante. Esto garantiza que el Select se inicialice con las opciones correctas ya disponibles.

## Archivo: `src/pages/ForkliftForm.tsx`

Línea ~203 (Select de modelo): agregar `key={form.manufacturer}` al componente Select:

```tsx
<Select key={form.manufacturer} value={form.model} onValueChange={handleModelChange} disabled={!form.manufacturer}>
```

Un solo cambio de una línea.

