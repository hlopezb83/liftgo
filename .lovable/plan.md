# Fix: el equipo seleccionado no se visualiza en el selector

## Causa raíz

En `src/features/quotes/components/quotes/AssignForkliftsCard.tsx` línea 47:

```ts
const selectedElsewhere = new Set(Object.values(selections));
```

Este `Set` se pasa igual a **todas** las líneas e incluye la selección de la línea actual. En `AssignForkliftsLineRow.tsx` línea 81, el filtro `!selectedElsewhere.has(f.id)` saca al equipo recién seleccionado del `SelectContent`. Como Radix `Select` necesita el `SelectItem` montado para que `SelectValue` resuelva la etiqueta, el trigger queda visualmente vacío aunque el `value` esté correcto.

La corrección de v6.14.4 que añadía `f.id === selectedValue || ...` en `AssignForkliftsLineRow` no aparece en el archivo actual (se revirtió o no se persistió).

## Cambios

### 1. `AssignForkliftsCard.tsx`
Calcular `selectedElsewhere` por línea, excluyendo la selección de la propia línea:

```ts
// Pasar selections completo en lugar de un Set compartido,
// y construir el Set por línea dentro del map.
```

Más limpio: pasar `selections` y `index` al hijo y que él derive el Set; o construir un `selectedElsewhereByLine` dentro del `linesData.map`. Elijo la segunda opción para no cambiar la API del componente hijo más de lo necesario:

```ts
const selectedElsewhereForLine = (currentIndex: number) =>
  new Set(
    Object.entries(selections)
      .filter(([k]) => Number(k) !== currentIndex)
      .map(([, v]) => v)
  );
```

Y al renderizar cada `AssignForkliftsLineRow` pasar `selectedElsewhere={selectedElsewhereForLine(index)}`.

### 2. `AssignForkliftsLineRow.tsx` (defensa en profundidad)
Reaplicar el guard para que, aun si llegara un Set "contaminado", el ítem seleccionado siempre se mantenga montado:

```tsx
.filter((f) => f.id === selectedValue || !selectedElsewhere.has(f.id))
```

### 3. Changelog
Nueva entrada patch **6.14.5**:
- `public/changelog.json` — añadir entrada al inicio
- `public/changelog/v6.14.5.json` — detalle: "Cotizaciones: corregido el selector de asignación de equipos del inventario que dejaba el campo en blanco tras seleccionar una opción".

## Verificación

Recargar la cotización aceptada `/quotes/a0b9a559-...`, abrir el selector de **Asignar Equipos del Inventario**, elegir un equipo y confirmar que el nombre + S/N quedan visibles en el trigger y que el botón **Asignar** se habilita.
