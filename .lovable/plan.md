# Restringir generacion de manual a Admin e incrementar version

## Cambios

### 1. Edge Function - Solo admin puede generar

En `supabase/functions/generate-manual/index.ts`:

- Cambiar la validacion de roles de `["admin", "administrativo"]` a solo `["admin"]` (linea 102)
- Antes de insertar el nuevo manual, consultar la version del manual existente mas reciente y calcular la siguiente version incrementando el minor (1.0 -> 2.0 -> 3.0, etc.)
- Reemplazar la version hardcodeada `"1.0"` por la version calculada
- A los usuarios que ven el manual, darles la opcion de ver diferentes versiones. La actual o la anterior.

### 2. Frontend - Solo admin ve el boton

En `src/pages/HelpPage.tsx`:

- Cambiar la condicion `isAdmin` de `role === "admin" || role === "administrativo"` a solo `role === "admin"` (linea 56)
- Esto oculta los botones "Generar Manual" y "Regenerar" para el rol administrativo

### 3. RLS - Restringir escritura a admin

Migracion SQL para actualizar la politica "Admins can manage manual" en `user_manual`:

- Cambiar de `role IN ('admin', 'administrativo')` a `role = 'admin'` para las operaciones de escritura (INSERT/UPDATE/DELETE)

### 4. Changelog

- Agregar entrada v3.3.1 con la descripcion del cambio

---

## Detalle tecnico de la version incremental

En la edge function, antes de borrar e insertar:

```text
1. SELECT version FROM user_manual ORDER BY generated_at DESC LIMIT 1
2. Si existe, parsear el major (ej: "2.0" -> 2), sumar 1 -> "3.0"
3. Si no existe, usar "1.0"
4. Insertar con la nueva version calculada
```

## Archivos a modificar

1. `supabase/functions/generate-manual/index.ts` - Restringir a admin, calcular version incremental
2. `src/pages/HelpPage.tsx` - Mostrar boton solo para admin
3. Migracion SQL - Actualizar politica RLS de user_manual
4. `src/lib/changelog.ts` - Agregar entrada v3.3.1