

## Agregar opcion de borrar cotizaciones (solo Admin)

### Cambios

**1. Hook `useDeleteQuote` en `src/hooks/useQuotes.ts`**
- Agregar un nuevo mutation hook que ejecute `supabase.from("quotes").delete().eq("id", id)`
- Invalida la query `["quotes"]` al completar

**2. Boton "Eliminar" en `src/pages/QuoteDetail.tsx`**
- Agregar un boton destructivo "Eliminar" visible solo para admins usando `RoleGuard` con `allowed={["admin"]}`
- Al hacer clic, mostrar un `AlertDialog` de confirmacion ("Esta accion no se puede deshacer")
- Al confirmar, ejecutar `deleteQuote.mutate(id)` y navegar a `/quotes`
- Importar `Trash2` de lucide-react, `AlertDialog` de los componentes UI, y `RoleGuard`

### Detalles tecnicos

**Archivo: `src/hooks/useQuotes.ts`**
- Agregar funcion `useDeleteQuote()` con mutation que hace DELETE en la tabla quotes por ID

**Archivo: `src/pages/QuoteDetail.tsx`**
- Estado `deleteDialogOpen` para controlar el AlertDialog
- Envolver el boton Eliminar en `<RoleGuard allowed={["admin"]}>`
- El boton aparece en la seccion de acciones del header, independiente del estado de la cotizacion
- Al confirmar eliminacion: ejecutar delete, mostrar toast de exito, navegar a `/quotes`

### Seguridad
- La tabla `quotes` ya tiene RLS que solo permite DELETE a admin (via "Admins full access quotes"). No se requieren cambios en base de datos.
- El boton solo se muestra en el frontend para usuarios con rol admin gracias a `RoleGuard`

