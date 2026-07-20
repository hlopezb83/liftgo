## Auditoría Ola 2.5 — Verde

- 1089/1089 Vitest + 22/22 Deno.
- Triggers correctos y retro-compatibles; EC-M4 en modo opt-in intencional.
- Sin bugs. Falta menor de tests SQL directos aceptado.

---

## Sprint 2 · Ola 2.6 — Segregación de roles y edge cases de queries

Objetivo: cerrar hallazgos que hoy dependen del cliente para no romperse a escala o permiten operaciones que deberían requerir un rol superior.

### 1. BL-M1 · Segregación del rol `dispatcher` en payments e invoices

**Problema** (migración `20260215213107:76-79`): `dispatcher` tiene RLS `FOR ALL` en `payments` e `invoices`. Un despachador puede timbrar, cancelar, editar o borrar facturas y registrar/borrar pagos — funciones que corresponden a `administrativo`/`admin`. Además `payments` no persiste `created_by`, lo que rompe trazabilidad.

**Fix**:
- Migración que reemplaza las policies de `dispatcher` en `payments` e `invoices`:
  - `SELECT`: mantener acceso.
  - `INSERT`/`UPDATE`/`DELETE`: revocar (queda restringido a `admin` + `administrativo`, que ya tienen policy propia).
- `payments`: agregar columna `created_by uuid` con default `auth.uid()` (nullable para registros históricos) + backfill NULL. Se muestra en el detalle del pago.
- Auditar `useCreatePayment`/`useDeletePayment` para confirmar que un despachador ya no puede llamarlos (los hooks siguen usando `.from()`, la RLS los frena).

**Tests**: Vitest de contrato RLS existente para `payments` (extender el patrón `useForklifts.rls.test.ts`).

### 2. EC-M2 · `useCustomers` sin `.limit()` + detalle por `find`

**Problema**: `useCustomers.ts:13-21` trae la lista completa sin `.limit()` — con >1000 clientes falla la paginación implícita y el hook de detalle no encuentra al cliente porque hace `list.find(id)` sobre una lista truncada.

**Fix**:
- `useCustomer(id)` deja de derivarse de `useCustomers()` y hace `select().eq("id", id).single()` directo.
- `useCustomers` agrega `.limit(1000)` explícito con orden estable + un warning si `data.length === 1000` (más adelante paginación real).

**Tests**: Vitest existente de `useCustomers`; agregar caso donde el mock devuelve exactamente 1000 y el detalle sigue funcionando.

### 3. EC-M3 · `useBookingsRange` sin `.limit()`

**Problema**: Calendar/Gantt puede omitir reservas silenciosamente cuando la ventana traiga >1000 rows (default Supabase).

**Fix**: `.limit(2000)` explícito + log warning si `data.length === 2000` para detectar cuándo migrar a paginación por semanas.

**Tests**: extender test existente del calendario.

### 4. EC-M5 · `delete-user` Edge Function: orden de borrado + TOCTOU

**Problema**:
- Borra `user_roles`/`profiles` antes que `auth.users`. Si el segundo falla queda usuario zombie sin roles.
- Guarda de "último admin" con `count()` antes del delete: dos requests concurrentes ambos ven >1 admin, ambos borran → 0 admins.

**Fix**:
- Reordenar: primero `auth.admin.deleteUser`; si tiene éxito, cascade borra el resto (o disparar limpieza).
- Guarda anti-último-admin: mover a RPC `SECURITY DEFINER` con `LOCK TABLE user_roles IN SHARE ROW EXCLUSIVE MODE` (o `SELECT ... FOR UPDATE` de los roles admin) para cerrar la ventana TOCTOU.

**Tests**: Deno test para la Edge Function que simule falla en el paso Auth y verifique que roles/profile no se tocaron.

---

### Detalles técnicos

```text
Migración única (v7.122.0):
  1. DROP + CREATE POLICY dispatcher en payments (SELECT only)          → BL-M1
  2. DROP + CREATE POLICY dispatcher en invoices (SELECT only)          → BL-M1
  3. ALTER TABLE payments ADD COLUMN created_by uuid DEFAULT auth.uid() → BL-M1
  4. CREATE FUNCTION delete_user_safely(target_user_id uuid)            → EC-M5
```

Frontend/edge en el mismo release:
- `src/features/customers/hooks/useCustomers.ts`: split `useCustomer` + `.limit(1000)`.
- `src/features/bookings/hooks/useBookings.ts`: `useBookingsRange` con `.limit(2000)` + warning.
- `supabase/functions/delete-user/index.ts`: reordenar y delegar guarda a RPC.
- Changelog: `public/changelog.json` + `public/changelog/v7.122.0.json` (minor).

### Verificación

- Vitest completo (esperado 1089+ verdes).
- Deno tests actualizados para `delete-user`.
- Smoke manual: intentar como despachador crear pago (debe fallar), timbrar factura (debe fallar), abrir cliente por id directo (debe funcionar).

### Fuera de alcance

- **BL-M5** (REP ImpSaldoAnt) — ola dedicada de CFDI-REP con casos de parcialidades fallidas.
- **EC-M1** (off-by-one UTC en reportes) — próxima ola de reportes.
- **Bloque UX-M*** — ola de UI/accesibilidad.
