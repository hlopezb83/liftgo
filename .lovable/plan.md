## Auditoría v7.88.0

**Tests dominio:** 73/73 en verde. **Bugs residuales detectados:**

1. **`complete_return_inspection` tiene overload duplicado** (BL-13 relacionado). Existen dos versiones del RPC con firmas casi idénticas (una con `p_inspected_at`, otra sin). PostgREST resuelve por # de parámetros, pero cualquier cliente que pase todos los args puede toparse con ambigüedad. La firma sin `inspected_at` es obsoleta.

2. **BL-13 técnicamente cerrado**: el RPC ya marca `bookings.status='completed'` al devolver. Falta verificar el flujo alterno (registro manual desde Logística sin inspección formal) y añadir tests que blinden el contrato.

3. **BL-14/parseRentalDate solo cubre YMD puro.** Callers actuales pasan columnas `date` de Supabase (siempre YMD) — verificado en 3 callsites. Correcto, pero conviene un test que blinde el fallback ISO.

4. **BL-15 no testea el borde de 28 días exactos** (`4w` sin días residuales). El código lo maneja bien pero un test explícito previene regresiones.

## Sprint 2 parte 2 (v7.88.1)

### Fixes de auditoría v7.88.0
- **Eliminar overload obsoleto** de `complete_return_inspection` (sin `p_inspected_at`) vía migración. Dejar únicamente la firma canónica.
- Agregar test de borde en `rentalCalculation.test.ts`:
  - `generateLineItemsFromModel` con YMD → 1 mes exacto (paridad con `generateLineItems`).
  - `calculateRentalCost` 28 días exactos (4 semanas) con `4w < m` → no cap.
  - `calculateRentalCost` 28 días exactos con `4w > m` → cap dispara.

### BL-12 — Prorrateo del primer mes recurrente
Investigar `useGenerateRecurringInvoices` + `usePreviewRecurringInvoices`. Objetivo: cuando una suscripción arranca a mitad de mes (p. ej. día 15), la primera factura debe prorratearse por los días restantes del mes en vez de cobrar mes completo. Implementación:
- Detectar si `billing_period_start` no coincide con el día 1.
- Calcular `daysInPeriod / daysInFullMonth * monthly_rate`.
- Documentar el comportamiento en el preview del diálogo.
- Tests unitarios cubriendo: inicio día 1 (sin prorrateo), inicio día 15 (mitad), inicio último día del mes.

### BL-13 — Blindaje del cierre de reserva al devolver
- Test de integración (mock supabase) que verifique: llamar `complete_return_inspection` marca `bookings.status='completed'` **y** `forklifts.status='available'` en la misma transacción.
- Auditar rutas alternas de devolución en `src/features/logistics` para confirmar que ninguna deja la reserva en `confirmed` sin devolución registrada.

### Changelog
- `public/changelog.json`: entrada v7.88.1 (patch).
- `public/changelog/v7.88.1.json`: detalle por sección.

## Detalles técnicos

**Archivos a modificar:**
- Migración: `DROP FUNCTION public.complete_return_inspection(uuid, uuid, text, text, numeric, numeric, text, text)` (8 args, sin `inspected_at`).
- `src/features/invoices/hooks/invoices/recurring/usePreviewRecurringInvoices.ts` — lógica de prorrateo.
- `src/features/invoices/hooks/invoices/recurring/useGenerateRecurringInvoices.ts` — replicar en generación.
- `src/lib/domain/__tests__/rentalCalculation.test.ts` — 3 tests borde.
- Nuevo `src/features/invoices/hooks/invoices/recurring/__tests__/prorateFirstMonth.test.ts`.
- Nuevo `src/features/logistics/__tests__/completeReturn.test.ts`.

**Riesgos:**
- Prorrateo cambia el total de facturas recurrentes generadas para clientes ya activos; sólo aplicará a **nuevas** suscripciones o al primer ciclo (detectado por `billing_period_start != día 1`). Documentar en changelog.
- Drop del overload obsoleto: verificar que no haya código llamando la variante de 8 args antes de eliminarla (grep en `src/` — si existe, actualizar callers).
