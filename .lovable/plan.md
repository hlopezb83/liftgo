

## Plan: Mejorar y estandarizar tablas en toda la app

### Mejoras al componente base `Table`

Todas las mejoras se aplican en un solo lugar (`src/components/ui/table.tsx`) para que se propaguen automáticamente a todas las tablas de la aplicación.

### Cambios específicos

1. **`src/components/ui/table.tsx`** — Actualizar estilos base:
   - **Zebra stripes**: Agregar `even:bg-muted/30` en `TableBody` para filas con fondo alternado
   - **Sticky headers**: Agregar `sticky top-0 z-10 bg-background` al `TableHeader`
   - **Bordes mejorados**: Agregar `border-b-2` al header y fondo `bg-muted/50` en `TableHead`
   - **Densidad compacta**: Reducir padding de `p-4` a `px-3 py-2` en `TableCell` y `h-12 px-4` a `h-9 px-3` en `TableHead`

2. **`src/components/ui/table.tsx`** — Mejorar el contenedor de scroll:
   - Agregar `max-h-[calc(100vh-20rem)]` al wrapper div del `Table` para que el sticky header funcione con scroll vertical

3. **`src/lib/changelog.ts`** — v3.16.1

### Impacto

Dado que todos los módulos (Flota, Reservas, Facturas, Contratos, Cotizaciones, Clientes, Entregas, Mantenimiento, Daños, Inspecciones, Auditoría, Portal) usan los mismos componentes base de `Table`, los cambios se aplican en cascada sin tocar cada página individual.

