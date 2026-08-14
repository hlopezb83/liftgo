# Fix: reservas ligadas a facturas canceladas bloquean re-facturación (y pivot roto)

## Diagnóstico (verificado con datos reales)

`useAllInvoiceBookings()` se usa para **excluir del selector de reservas** aquellas que ya están facturadas
(`collectInvoicedBookingIds` → `filterAvailableBookings`). Hay **dos bugs reales**:

### Bug A — El pivot siempre devuelve `[]` (activo, doble facturación)
`src/features/invoices/hooks/invoices/useInvoiceBookings.ts`:
- `useAllInvoiceBookings()` delega en `invoiceBookingQueries.list({})` (línea 42).
- Ese `list` (líneas 18-28) tiene `if (!invoiceId) return []`.
- Como `useAllInvoiceBookings()` no pasa `invoiceId`, **siempre devuelve `[]`**.

Consecuencia: las reservas ligadas a una factura **solo vía la tabla pivote** `invoice_bookings`
(sin `invoices.booking_id` directo) nunca se excluyen del selector → aparecen como disponibles →
**riesgo de doble facturación**. Confirmado en BD: la factura `fa1e3ae4` tiene `booking_id = null`
pero filas pivote para las reservas `2c02da77` y `c0645139`; otra factura `a6c526b7` (cancelada) tiene
`booking_id = 17f345b1` pero el pivot incluye además `1f850f99` y `04debdd0`, que el path directo no captura.

### Bug B — Filas pivote de facturas canceladas bloquean re-facturar (latente, enmascarado por A)
`collectInvoicedBookingIds` (líneas 59-61) añade `row.booking_id` del pivote **sin filtrar por estado
de la factura**. El path directo sí filtra canceladas (`inv.status !== "cancelled"`, línea 56), pero el
del pivote no. Una reserva ligada a una factura cancelada vía pivote quedaría bloqueada para siempre.
Confirmado en BD: hay varias filas pivote ligadas a facturas con `invoice_status: cancelled`.

El diff propuesto corrige **ambos** de una sola vez: que el pivot devuelva todas las filas y excluya las
de facturas canceladas.

## Por qué el diff no aplica literalmente
El diff fue escrito contra una versión vieja del archivo donde `useAllInvoiceBookings` tenía su propia
`useQuery` inline. El archivo actual fue refactorizado a un `defineEntityQueries` compartido (`list`)
que está gateado por `invoiceId` y selecciona `bookings(*, forklifts(...))` (pesado). Hay que adaptar la
intención del diff a esta estructura, no aplicarlo literal.

## Cambios

### 1. `src/features/invoices/hooks/invoices/useInvoiceBookings.ts`
Dar a `useAllInvoiceBookings` una **query dedicada y ligera** que no dependa del `list` compartido:
```ts
/** Todas las filas del pivote para facturas NO canceladas (excluye reservas ya facturadas). */
export function useAllInvoiceBookings() {
  return useQuery({
    queryKey: [...invoiceBookingKeys.all, "non-cancelled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_bookings")
        .select("booking_id, invoice_id, invoices!inner(status)")
        .neq("invoices.status", "cancelled");
      if (error) throw error;
      return (data ?? []) as { booking_id: string; invoice_id: string }[];
    },
  });
}
```
- Se elimina el gateo por `invoiceId` (corrige Bug A).
- `invoices!inner(status)` + `.neq("invoices.status", "cancelled")` filtra server-side las canceladas
  (corrige Bug B) con inner join forzado para evitar la ambigüedad de PostgREST entre embed (left) y
  filter (root). No seleccionamos `bookings(...)` → query más liviana que el `list` compartido.
- `queryKey` deriva de `invoiceBookingKeys.all` → queda invalidada por `useSyncInvoiceBookings`
  (que invalida `invoiceBookingKeys.all`). Mismo contrato de invalidación que hoy.
- `collectInvoicedBookingIds` **no se toca**: ya añade `row.booking_id` y ahora las filas canceladas
  no llegan. Cambio mínimo de superficie.

### 2. Prueba de regresión — `src/features/invoices/hooks/useInvoiceFormLogic` (exportar `collectInvoicedBookingIds`)
Exportar `collectInvoicedBookingIds` (privada hoy) y crear
`src/features/invoices/hooks/__tests__/collectInvoicedBookingIds.test.ts` con casos:
- Reserva solo en pivote de factura **pagada** → queda excluida (regresión de Bug A).
- Reserva en pivote de factura **cancelada** → NO se excluye → puede re-facturarse (regresión de Bug B).
- Reserva de la factura en edición (`currentInvoiceId`) → no se excluye a sí misma.
- Combinación: misma reserva en pivote de una cancelada + una pagada → se excluye (hay al menos una activa).

## Verificación
- `tsgo --noEmit`
- `eslint` sobre los dos archivos + el test.
- `vitest run` suite completa (debe mantenerse en verde; hoy 1702).

## Riesgo
PostgREST soporta filtrar por columna de tabla relacionada (`invoices.status`) con inner join forzado
vía `!inner`. Si en implementación el filtro no excluyera como se espera, se valida con una lectura
GET al endpoint REST antes de cerrar; como respaldo, se filtra client-side leyendo `invoices.status`
del embed. No es esperado, pero es el plan B.

## Versión
v7.320.3 (patch) — corrección de bug de facturación.
