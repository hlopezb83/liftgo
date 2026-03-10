

# Plan: Reducir ancho de columnas Kanban en CRM

Cambiar `w-72` (288px) a `w-64` (256px) en las dos ocurrencias dentro de `src/pages/CRMPage.tsx`: el skeleton de carga y las columnas reales del Kanban.

## Archivo: `src/pages/CRMPage.tsx`
- Línea 95: `w-72` → `w-64` (skeleton)
- Línea 102: `w-72` → `w-64` (columna real)

