

## Plan: Eliminar carta de Reservas del Calendario (v3.17.5)

Eliminar el bloque `<Card>` de "Reservas" (líneas 149-191) y limpiar imports y estado que ya no se usan.

### Cambios en `src/pages/CalendarPage.tsx`

- Eliminar la carta de Reservas completa (líneas 149-191)
- Eliminar estado `statusFilter` (ya no se usa)
- Eliminar memo `filteredBookings` (ya no se usa)
- Eliminar imports no utilizados: `StatusBadge`, `BookingActions`, `RecurringBillingBadge`, `Repeat`

### `src/lib/changelog.ts` — v3.17.5

