

## Plan: Hacer filas de clientes clickeables (v3.18.8)

### Cambio
Agregar `onClick` y `cursor-pointer` a cada `TableRow` en la tabla de clientes para que al hacer clic en cualquier parte de la fila se navegue al detalle del cliente (`/customers/{id}`). Los botones de acción (ver/editar) se mantienen con `stopPropagation` para evitar doble navegación.

### Archivos
- **`src/pages/CustomersPage.tsx`** — Agregar `onClick` + `className="cursor-pointer hover:bg-muted/50"` al `TableRow`, y `e.stopPropagation()` en los botones de editar
- **`src/lib/changelog.ts`** — v3.18.8

