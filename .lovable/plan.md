# Bug: el nombre no se guarda pero el toast dice "éxito"

## Causa raíz

La tabla `profiles` solo tiene esta política de UPDATE:

```
Users can update own profile  →  USING (auth.uid() = user_id)
```

No existe ninguna política que permita a `admin` o `administrativo` actualizar el `profiles` de **otro** usuario. Cuando un admin edita el nombre de `ventas@liftgo.com.mx`, RLS filtra la fila y el `UPDATE` afecta **0 filas**, pero Supabase **no devuelve error** (RLS sobre UPDATE simplemente excluye filas no visibles). 

En `useUpdateName` (src/features/users/hooks/users/useUserMutations.ts) solo se valida `if (error) throw error`, nunca se revisa cuántas filas se modificaron, así que se dispara `toast.success("Nombre actualizado")` aunque nada haya cambiado en BD.

El mismo patrón existe en `useUpdateRole` (sobre `user_roles`), aunque las policies de esa tabla sí dan acceso a admin.

## Plan

### 1. Migración SQL — policies de `profiles`

Agregar policies para que admin y administrativo puedan actualizar/insertar perfiles ajenos:

```sql
CREATE POLICY "Admins update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));
```

(Solo UPDATE. INSERT/DELETE de perfiles ajenos ya está cubierto por el trigger de `auth.users` y el flujo de `delete-user` Edge Function con service role; no se tocan.)

### 2. Defensa en código — `useUpdateName`

Cambiar el `update` para pedir confirmación de filas afectadas y disparar `notifyError` si no se modificó nada:

```ts
const { data, error } = await supabase
  .from("profiles")
  .update({ full_name: fullName })
  .eq("user_id", userId)
  .select("user_id");
if (error) throw error;
if (!data || data.length === 0) {
  throw new Error("No se actualizó ningún registro. Verifica tus permisos.");
}
```

Esto blinda el hook contra futuros silencios de RLS y aprovecha el sistema `notifyError` ya migrado (Ver detalles muestra el contexto exacto).

### 3. Defensa equivalente — `useUpdateRole`

Aplicar el mismo patrón `.select()` + validación de filas. Aunque hoy `user_roles` sí permite a admin, este es el mismo anti-pattern y conviene cerrarlo en el mismo cambio para evitar otro "success silencioso".

### 4. Changelog

Patch `6.15.1` en `public/changelog.json` + `public/changelog/v6.15.1.json`:
- Fix: admins pueden actualizar nombres de otros usuarios.
- Fix: mutaciones de usuarios ahora detectan updates en cero filas y muestran error real en lugar de éxito falso.

## Fuera de alcance

- Otras tablas con el mismo patrón (no hay reportes activos).
- Refactor general del hook a un util `assertRowsAffected`.

## Verificación post-implementación

1. Como admin, editar nombre de `ventas@liftgo.com.mx` → debe persistir y refrescar lista.
2. Quitar temporalmente la nueva policy (mental check) → la mutación ahora debe mostrar error "Ver detalles" en vez de éxito.
3. `npx tsc --noEmit` y `eslint` limpios.
