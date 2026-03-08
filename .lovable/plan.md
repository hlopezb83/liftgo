

## Plan: Eliminar botones de acción redundantes en tabla de clientes (v3.18.9)

### Cambio
Eliminar la columna de botones Ver/Editar de la tabla de clientes, ya que la fila completa es clickeable y los hace redundantes.

### Archivos
- **`src/pages/CustomersPage.tsx`** — Eliminar la columna `<TableHead>` vacía del header y el `<TableCell>` con los botones de la función `renderRow`
- **`src/lib/changelog.ts`** — v3.18.9

