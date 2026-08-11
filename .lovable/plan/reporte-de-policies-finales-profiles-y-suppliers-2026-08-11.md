# Reporte de policies finales: profiles y suppliers

## 1. Estado FINAL (consultado en la base de datos real, no en los archivos)

Las policies `USING (true)` que aparecen en `20260214003229` (profiles) y `20260309193936` (suppliers) **ya no existen**: migraciones posteriores las reemplazaron. Estado vivo hoy:

### public.profiles — RLS: ON, FORCE: ON
| Operación | Policy | Rol | Condición |
|---|---|---|---|
| SELECT | Users can view own profile | authenticated | `(select auth.uid()) = user_id` |
| SELECT | Staff can view all profiles | authenticated | `is_ops_staff()` |
| SELECT | Ventas read profiles | authenticated | `has_role(..., 'ventas')` |
| SELECT | Auditor read profiles | authenticated | `has_role(..., 'auditor')` |
| INSERT | Users can insert own profile | authenticated | check: `(select auth.uid()) = user_id` |
| UPDATE | Users can update own profile | authenticated | propio o admin + `profile_update_preserves_protected(...)` |
| UPDATE | Admins update any profile | authenticated | `has_role(..., 'admin')` |
| UPDATE | Administrativo update any profile | authenticated | `has_role(..., 'administrativo')` |

Sin policy de DELETE (correcto: nadie borra perfiles vía API).

### public.suppliers — RLS: ON, FORCE: **OFF**
| Operación | Policy | Rol | Condición |
|---|---|---|---|
| SELECT | Staff read suppliers | authenticated | `is_staff()` |
| INSERT | Admin/administrativo can insert | authenticated | `is_admin_or_administrativo()` |
| UPDATE | Admin/administrativo can update | authenticated | idem |
| DELETE | Admin/administrativo can delete | authenticated | idem |

## 2. Hallazgos que sí quedan pendientes

1. **`anon` conserva GRANT SELECT/INSERT/UPDATE/DELETE** sobre `profiles` y `suppliers`. Hoy no puede leer nada (ninguna policy aplica a `anon`), pero el grant es más amplio de lo necesario y una policy futura mal escrita lo abriría.
2. **`suppliers` no tiene FORCE ROW LEVEL SECURITY**, a diferencia de `profiles` y del resto de tablas sensibles endurecidas en v7.299.1. El dueño de la tabla evade RLS.
3. **No existe `supabase/tests/rls/suppliers.sql`**, así que el contrato de acceso de proveedores no está cubierto en CI.

No hay ninguna policy viva con `USING (true)` en estas dos tablas, así que la migración es de cierre de bordes, no de reescritura de policies.

## 3. Cambios propuestos

### Migración única de endurecimiento
- `REVOKE ALL ON public.profiles, public.suppliers FROM anon;`
- `GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;` (sin DELETE, que ninguna policy permite) y `GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;` — se reafirman explícitamente para dejarlos documentados.
- `GRANT ALL ... TO service_role;` en ambas.
- `ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;`
- Sin tocar las policies vivas: la semántica que consumen `useProfile` y `useSuppliers` no cambia.

### Suites de tests RLS
- `supabase/tests/rls/profiles.sql`: añadir casos para `anon` (cero filas, insert denegado) y para el nuevo grant sin DELETE.
- `supabase/tests/rls/suppliers.sql` (nuevo): verificar anon bloqueado, portal bloqueado, staff lee pero no escribe, admin/administrativo CRUD completo, service_role sin restricción.

### Detalles técnicos
- Antes de escribir la migración se revisan `useProfile`/`useSuppliers` y `profiles.sql` para no romper columnas o verbos que el frontend usa.
- Se corre `scripts/lint-migrations.ts` y las suites SQL localmente antes de cerrar.
- Changelog: entrada **patch** (endurecimiento de permisos, sin cambio funcional).
