# Detalles visuales pendientes: Utilización y vistas previas de fotos

Dos pendientes menores detectados al revisar el código actual: el reporte de Utilización por Modelo usa color en línea sin la base visual del resto de gráficas, y los componentes de vistas previas de fotos no liberan todas las URLs temporales que crean.

## 1. Reporte de Utilización por Modelo

- La gráfica (`UtilizationChart`) no usa el tema unificado de gráficas del proyecto: le faltan la cuadrícula canónica (`chartGridProps`) y los ticks estándar (`chartTick`) que ya usan los demás reportes.
- El eje Y de modelos tiene ancho fijo de 160 px, lo que corta nombres largos; se pasa a un ancho mayor con truncado explícito.
- El tooltip queda con el estilo por defecto de Recharts (blanco duro); se alinea a los tokens de la app (fondo `--popover`, borde `--border`, radio y sombra).
- En la columna "Utilización" de la tabla, el porcentaje se pinta con `style={{ color }}` y `font-mono`. Se cambia a clases con tokens semánticos (`text-status-available` / `text-status-warning` / `text-status-overdue`) y `tabular-nums`, para respetar tema claro/oscuro y alinear cifras como en el resto de las tablas.
- `getUtilColor` conserva los mismos umbrales (>75 verde, 40–75 ámbar, <40 rojo) y sigue devolviendo el color para las barras; se agrega un helper hermano que devuelve la clase de texto.

## 2. Liberación de vistas previas de fotos

En `DragDropImageUploader`:

- No hay limpieza al desmontar: si el usuario suelta fotos y cierra el panel o navega sin subirlas, esas URLs quedan vivas hasta recargar. Se agrega el mismo patrón que ya usa el formulario de daños (ref espejo + limpieza sólo en desmontaje), para no romper las imágenes visibles al agregar más.
- Al recortar con `.slice(0, maxFiles)`, las fotos excedentes se descartan sin revocar su URL. Se revocan las que quedan fuera y se avisa al usuario que se alcanzó el límite.
- Las miniaturas usan `key={i}`, lo que puede reciclar el `img` equivocado al borrar del centro; se pasa a una llave estable por archivo.

En `useReportDamageForm` se aplica la misma corrección del recorte a 10 fotos (revocar las excedentes en lugar de descartarlas en silencio).

## Alcance

Sólo presentación y manejo de URLs temporales. No cambia la lógica de cálculo de utilización, ni la subida de archivos, ni la base de datos.

## Detalles técnicos

- Archivos: `src/features/reports/components/reports/utilizationByModel/UtilizationChart.tsx`, `utilizationColumns.tsx`, `utilizationHelpers.ts`, `src/components/forms/DragDropImageUploader.tsx`, `src/features/damage/hooks/useReportDamageForm.ts`.
- Se reutiliza `src/lib/charts/chartTheme.ts` y los tokens ya definidos en `src/index.css`.
- Verificación: `tsgo`, lint, Vitest, y revisión visual con Playwright del reporte de utilización y del uploader (arrastrar, exceder límite, quitar miniatura).
- Cierre: nueva entrada patch en `public/changelog.json` y `public/changelog/v{X.Y.Z}.json`.
