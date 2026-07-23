
# R9 · Lote final de cierre (v7.191.0)

Tres pendientes verificados en el reporte R9. Cierra el programa R7→R9.

## Bloque 1 — Seed `role_permissions` para "Facturas de Proveedor"

Nueva migración que inserta el módulo faltante. La columna real es `access_level` (no `access`), y la migración vieja `20260624000723` fue no-op porque el módulo `Cuentas por Pagar` nunca existió.

```sql
INSERT INTO public.role_permissions (role, module, access_level) VALUES
  ('admin',          'Facturas de Proveedor', 'full'),
  ('administrativo', 'Facturas de Proveedor', 'full'),
  ('auditor',        'Facturas de Proveedor', 'read')
ON CONFLICT (role, module) DO NOTHING;
```

Verificar antes: revisar valores válidos del enum de roles y del check de `access_level` en `20260313001007` para copiar sintaxis exacta.

**Aceptación:** admin entra a `/cuentas-por-pagar` y `/cuentas-por-pagar/antiguedad`; mechanic ve NoAccess; desaparece el warning de consola.

## Bloque 2 — Ref síncrono anti-doble-submit (<25ms)

Añadir tercera capa (además de `onPointerDown` y el Proxy de `mutate`) usando un `useRef` síncrono inmune al ciclo de render.

- **`src/components/forms/FormActions.tsx`**: `inFlightRef` que se activa en `onPointerDown` del submit y se libera cuando `busy` vuelve a `false` (vía `useEffect` sobre `busy`). Si el ref está activo, el pointerDown hace `preventDefault`. Complementa (no reemplaza) el bloqueo por `busy`.
- **`src/lib/hooks/useEntityMutation.ts`**: en el Proxy de `mutate`, además de `target.isPending`, chequear un `inFlightRef` local del hook que se setea antes de invocar `originalMutate` y se limpia en `onSettled`. Cubre la ventana entre el disparo y el flush de `isPending=true`.
- **`src/features/invoices/hooks/invoiceDetail/useStampInvoiceFlow.ts`**: `inFlightRef` alrededor de `await backfillStampSnapshot()` + `mutate`, liberado en `finally`. Evita el doble timbrado y el toast info duplicado.

**Aceptación:** test vitest — dos invocaciones síncronas de submit → 1 sola llamada a `mutate`. Doble click en Timbrar → 1 sola invocación a la edge function.

## Bloque 3 — Moneda en preview de extensión de renta

- **`src/features/bookings/hooks/bookingActions/useExtendBookingPreview.ts`**: retornar `{ ...totals, currency: booking.currency ?? "MXN" }`.
- **`src/features/bookings/components/bookings/BookingActionDialogs.tsx:77`**: usar `formatCurrencyWithCode(extendPreview.total, extendPreview.currency)` (helper ya existe en `src/lib/format/formatCurrency.ts`).

**Aceptación:** renta USD → diálogo muestra "US$29,000.00"; renta MXN sin cambios visuales.

## Verificación y cierre

- `bun run lint` limpio en archivos tocados.
- Vitest: nuevo test de doble-invocación sobre `useEntityMutation` (o `FormActions`) + tests existentes verdes.
- Smoke manual: CxP con admin, dblclick en "Agregar cliente" → 1 fila, extensión de renta USD con moneda visible.
- Bump a **v7.191.0** (patch: 3 fixes puntuales) + entrada en `public/changelog.json` y `public/changelog/v7.191.0.json`.

## Notas técnicas

- El Proxy actual solo intercepta `mutate` (no `mutateAsync`) — se mantiene ese contrato; la nueva guarda ref refuerza `mutate` únicamente.
- `formatCurrencyWithCode` ya soporta `USD`/`MXN` vía `Intl.NumberFormat`, no requiere wrapper nuevo.
- La migración de Bloque 1 es idempotente (`ON CONFLICT DO NOTHING`), segura de re-ejecutar.
