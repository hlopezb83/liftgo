
# Otorgar acceso al rol Administrativo al modulo de Configuracion de Operaciones

## Que se va a hacer
Permitir que los usuarios con rol **Administrativo** puedan acceder al modulo de Configuracion de Operaciones y gestionar (crear, editar, eliminar) modelos de equipo, operadores y mecanicos.

## Cambios

### 1. Acceso a la ruta
Agregar el rol `administrativo` a la ruta `/settings/operations` en la configuracion de rutas.

**Archivo:** `src/App.tsx`

### 2. Visibilidad en el menu lateral
Agregar `administrativo` a los roles permitidos del enlace "Configuracion" en el sidebar.

**Archivo:** `src/components/AppSidebar.tsx`

### 3. Permisos en la base de datos
Agregar politicas RLS para que el rol `administrativo` pueda leer y escribir en las siguientes tablas:

- **equipment_models** -- Actualmente solo `admin` tiene acceso completo. Se agregara politica ALL para `administrativo`.
- **drivers** -- Mismo caso. Se agregara politica ALL para `administrativo`.
- **mechanics** -- Mismo caso. Se agregara politica ALL para `administrativo`.

## Archivos a modificar
- `src/App.tsx` -- agregar "administrativo" a la ruta
- `src/components/AppSidebar.tsx` -- agregar "administrativo" al enlace del menu
- Migracion SQL -- 3 nuevas politicas RLS
