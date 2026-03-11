

# El usuario administrativo ya puede modificar cotizaciones

Tras revisar el código, el rol "administrativo" **ya tiene permisos completos** para crear y editar cotizaciones:

- **Rutas**: `/quotes/new` y `/quotes/:id/edit` incluyen `"administrativo"` en sus roles permitidos (App.tsx, líneas 97-99)
- **Base de datos (RLS)**: Existe la política `"Administrativo full access quotes"` que otorga lectura, escritura, actualización y eliminación
- **UI**: El botón "Editar" en la vista de detalle de cotización **no tiene restricción** de RoleGuard, por lo que es visible para cualquier usuario con acceso a la página

La **única restricción** es el botón de **Eliminar**, que está limitado a `["admin"]` solamente.

## Cambio propuesto

Si deseas que "administrativo" también pueda **eliminar** cotizaciones:

### `src/pages/QuoteDetail.tsx`
- Cambiar `<RoleGuard allowed={["admin"]}>` a `<RoleGuard allowed={["admin", "administrativo"]}>` en el botón de eliminar

Este es el único cambio necesario. Todo lo demás (crear, editar, cambiar estado) ya funciona para el rol administrativo.

