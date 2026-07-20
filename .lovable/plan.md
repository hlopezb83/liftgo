## Auditoría Ola 2.4 (v7.120.0)

- **Tests**: 1086/1086 Vitest verdes (incluye nuevo `useExtendBookingPreview.test.ts`). Deno estable en 22/22 desde Ola 2.3.
- **Migraciones**: `create_booking` y `convert_quote_to_bookings` correctas, con locks (`FOR UPDATE`, `pg_advisory_xact_lock`) y fallback legacy en tarifas.
- **Sin bugs detectados**. Cobertura de tests suficiente para el cambio de tasa; BL-A3 apoyado por la exclusion constraint existente.

Verde. Procedo a la siguiente ola.

---

## Sprint 2 · Ola 2.5 — Integridad transaccional y salvaguardas de dominio

Objetivo: cerrar los 4 hallazgos restantes del bloque "Business Logic / Edge Cases" que dependen de la DB para blindar operaciones que hoy confían en el cliente.

### 1. BL-M3 · Trigger anti sobre-crédito de Notas de Crédito

**Problema**: `useCreditNoteForm.ts` clampea a 0 el excedente en la UI. Si otra pestaña emite una NC concurrente, la suma acreditada puede superar el total de la factura sin error.

**Fix**: Trigger `BEFORE INSERT OR UPDATE` en `credit_notes` que sume los montos ya acreditados (excluyendo la NC en curso y cancelled), y lance `RAISE EXCEPTION` si `total_acreditado + monto_nuevo > invoice.total`. Comparación con tolerancia de 1 centavo.

**Tests**: Vitest para el hook (mensaje de error server-side). SQL smoke: emitir 2 NCs que juntas exceden y esperar 23514/P0001.

### 2. BL-M4 · Soft-delete de flota (bloqueo y filtrado)

**Contexto**: `deleted_at` ya existe en `forklifts`, `customers`, `damage_records` (migración 20260624141822). Falta la lógica de escritura y lectura.

**Fix**:
- Nueva RPC `soft_delete_forklift(p_id)`: valida que no haya `bookings` activas (`confirmed/in_progress/scheduled` con `end_date >= today`) ni `invoices` abiertas; setea `deleted_at = now(), deleted_by = auth.uid()`. Reemplaza el `delete_forklift` destructivo en `useForklifts`.
- Nueva RPC `restore_forklift(p_id)` (solo admin).
- Filtrar `deleted_at IS NULL` en `useForklifts` (lista principal) y variantes (`useForklift`, selectores). Modo `?includeDeleted=1` solo para vista admin de auditoría (fuera de alcance).

**Tests**: Vitest de `useForklifts` (mock filtra deleted). Test de la RPC (bookings activas → error controlado).

### 3. BL-M6 · Devolución dañada exige `damage_record`

**Problema**: `process_return` (migración 20260720023115) permite `condition='damaged'` con `damage_cost=0` sin crear registro de daño.

**Fix**: Ajustar la RPC para que cuando `p_condition='damaged'`:
- Requiera `p_damage_cost > 0` **o** un `p_damage_notes` no vacío que se persista como `damage_records` (severity `minor`, cost 0 pero documentado).
- Si no cumple, `RAISE EXCEPTION 'Devolución marcada como dañada requiere costo o descripción del daño'`.
- Además marca el forklift a `maintenance` (no `available`) hasta que se cierre el `damage_record`.

**Tests**: Deno test o Vitest via RPC mock; caso feliz + caso rechazado.

### 4. EC-M4 · Optimistic locking sistémico

**Alcance controlado (no todo a la vez)**: `bookings`, `invoices`, `quotes`, `customers`.

**Fix**:
- Migración: `ALTER TABLE ... ADD COLUMN version integer NOT NULL DEFAULT 1` en las 4 tablas.
- Trigger `BEFORE UPDATE` genérico `bump_version()`: si el `NEW.version` recibido ≠ `OLD.version`, `RAISE EXCEPTION 'stale_write'` (SQLSTATE P0001); si es igual, incrementa a `OLD.version + 1`.
- Hooks de mutación (`useBookingMutations`, `useInvoiceMutations`, `useQuoteMutations`, `useCustomerMutations`) envían `version` en el update y traducen `stale_write` a un toast: *"Este registro fue modificado en otra pestaña. Recarga para ver los cambios."*
- Regenerar `types.ts` post-migración; ajustar los mutation payloads.

**Tests**: Vitest por cada hook simulando update con `version` obsoleto (expect toast). Test SQL directo del trigger.

---

### Detalles técnicos

```text
Migración única (v7.121.0):
  1. CREATE TRIGGER credit_notes_max_check  → BL-M3
  2. CREATE FUNCTION soft_delete_forklift  → BL-M4
  3. CREATE FUNCTION restore_forklift      → BL-M4
  4. ALTER FUNCTION process_return         → BL-M6
  5. ALTER TABLE bookings/invoices/quotes/customers ADD version + trigger bump_version → EC-M4
  6. GRANTs (authenticated + service_role) sobre las nuevas RPCs
```

Frontend en el mismo release:
- `useCreditNoteForm.ts`: quitar clamp silencioso, propagar error de trigger.
- `useForklifts.ts`, `ForkliftDetail`: `soft_delete_forklift` + filtrar `deleted_at`.
- `useBookingMutations.ts`, `useInvoiceMutations.ts`, `useQuoteMutations.ts`, `useCustomerMutations.ts`: enviar `version`, atrapar `stale_write`.
- Changelog: `public/changelog.json` + `public/changelog/v7.121.0.json` (minor).

### Verificación

- Vitest completo (esperado 1086+ verdes con ~6 tests nuevos).
- Deno para RPCs afectadas donde aplique.
- Smoke manual: emitir NC excedida, borrar unidad con reserva activa, devolver dañado sin costo, editar reserva en dos pestañas.

### Fuera de alcance

- BL-M1 (segregación de rol dispatcher en payments/invoices).
- BL-M5 (REP ImpSaldoAnt) — requiere ola dedicada de CFDI-REP.
- EC-M1..M3, EC-M5 y bloque UX-M* — olas posteriores.
