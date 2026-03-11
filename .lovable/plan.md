

# Mejorar visibilidad de permisos por rol

## Problema
El `RolePermissionsTooltip` usa un Radix `Tooltip` dentro de un Radix `Select` dropdown. Esto causa conflictos de portales/z-index: el contenido del tooltip se renderiza como texto accesible invisible (1px, overflow hidden) en lugar de mostrarse visualmente.

## Solución

### 1. Reemplazar Tooltip por Popover en el componente `RolePermissionsTooltip`
Cambiar de `Tooltip` a `Popover` con click en el icono Info. Los Popovers usan un `Portal` propio que escapa del contexto del Select y se muestra correctamente sobre cualquier overlay.

### 2. Agregar panel de permisos visible en la página de Usuarios
Debajo de los filtros, agregar un componente colapsable `RolePermissionsMatrix` que muestre una tabla/grid de roles vs módulos con indicadores visuales (check verde = acceso completo, ojo azul = solo lectura, dash gris = sin acceso). Esto da visibilidad inmediata sin depender de tooltips.

## Cambios técnicos

### `src/components/RolePermissionsTooltip.tsx`
- Reemplazar `Tooltip/TooltipContent` por `Popover/PopoverContent`
- El icono Info abre el popover al hacer click (funciona dentro de Select)
- Agregar `stopPropagation` en el trigger para no activar el SelectItem al clickear el icono

### `src/components/RolePermissionsMatrix.tsx` (nuevo)
- Componente con `Collapsible` que muestra una tabla de roles x módulos
- Columnas: un rol por columna
- Filas: cada módulo del sistema
- Celdas: icono de check (acceso), ojo (lectura), o dash (sin acceso)
- Botón para expandir/colapsar

### `src/pages/UserManagementPage.tsx`
- Importar y renderizar `RolePermissionsMatrix` entre los filtros y la tabla de usuarios

