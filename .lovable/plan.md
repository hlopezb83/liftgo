
# Roles con Colores Diferenciados

## Cambios

1. **Renombrar "Administrador" a "Admin"** en `ROLE_LABELS`.

2. **Asignar un color unico a cada rol** usando badges con colores distinctivos:
   - **Admin** -- Rojo (`bg-red-600 text-white`) para resaltar su importancia
   - **Administrativo** -- Azul (`bg-blue-600 text-white`)
   - **Despachador** -- Amarillo/Ambar (`bg-amber-500 text-white`)
   - **Mecanico** -- Verde (`bg-emerald-600 text-white`)

3. **Aplicar los colores en 3 lugares**:
   - En las opciones del `Select` de rol (dropdown)
   - En la columna "Rol" de la tabla (valor seleccionado visible)
   - En las cards mobile

## Detalles Tecnicos

**Archivo a modificar:** `src/pages/UserManagementPage.tsx`

- Cambiar `ROLE_LABELS` linea 22: `admin: "Admin"` (era "Administrador")
- Crear un mapa `ROLE_COLORS` con las clases de Tailwind para cada rol
- Usar ese mapa en los `SelectItem` y en el `SelectValue` para que el badge seleccionado tambien muestre el color correcto

```text
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-600 text-white",
  administrativo: "bg-blue-600 text-white",
  dispatcher: "bg-amber-500 text-white",
  mechanic: "bg-emerald-600 text-white",
};
```

**Riesgo:** Minimo. Solo cambios cosmeticos en un archivo.
