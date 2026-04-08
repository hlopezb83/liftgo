

## Refuerzo de RLS — Corregir políticas permisivas y funciones inseguras

### Estado actual

Las 33 tablas ya tienen RLS habilitado y políticas basadas en `has_role()`. Sin embargo, el linter detectó problemas específicos que necesitan corrección.

### Problemas encontrados

**1. Políticas demasiado permisivas (USING true / WITH CHECK true en escritura)**
- `booking_extensions` — política ALL con `true`: cualquier usuario autenticado puede crear, modificar y eliminar extensiones de reserva
- `collection_notes` — política ALL con `true`: cualquier usuario autenticado puede manipular notas de cobranza

**2. Funciones sin `search_path` configurado (6 funciones)**
- `next_booking_number`, `next_delivery_number`, `next_inspection_number`, `set_delivery_number`, `set_inspection_number`, `set_prospect_created_by`
- Riesgo: un atacante podría crear objetos en otro schema para interceptar las llamadas

**3. Dispatchers no pueden actualizar estado de montacargas**
- `useUpdateStatus()` hace `UPDATE` directo a `forklifts`, pero dispatchers solo tienen SELECT
- Los cambios de estado desde dispatcher fallan silenciosamente — bug funcional

### Cambios propuestos

**Migración SQL única:**

1. **`booking_extensions`** — Reemplazar política `true/true` con políticas por rol:
   - Admin, Administrativo, Dispatcher: ALL
   - Auditor, Mechanic, Ventas: SELECT
   - Customer: SELECT donde `booking_id` sea de su propia reserva

2. **`collection_notes`** — Reemplazar política `true/true` con políticas por rol:
   - Admin, Administrativo, Dispatcher: ALL
   - Auditor: SELECT

3. **Forklifts** — Agregar política de escritura para Dispatcher:
   - Dispatcher: UPDATE (para permitir cambios de estado)

4. **Funciones** — Agregar `SET search_path = public` a las 6 funciones que les falta

**`src/lib/changelog.ts`** — Entrada v5.13.2

### Archivos modificados
- Migración SQL (una)
- `src/lib/changelog.ts`

### Notas
- No se requieren cambios en el frontend — las políticas existentes ya son compatibles con el código actual
- El código que usa `RoleGuard` en el frontend seguirá funcionando igual, ahora con respaldo real en la base de datos
