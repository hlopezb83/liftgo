

## Corregir formato de fechas a DD/MM/YYYY en toda la aplicacion

### Problema
Multiples paginas muestran fechas en formato ISO de base de datos (`yyyy-MM-dd`, ej. "2026-03-02") directamente en la interfaz, en lugar del formato mexicano `dd/MM/yyyy` (ej. "02/03/2026"). Tambien hay un caso de formato en ingles ("MMM d, HH:mm").

### Solucion

Crear una funcion utilitaria `formatDateDisplay` en `src/lib/utils.ts` para centralizar el formateo, y aplicarla en todos los archivos afectados.

### Funcion utilitaria nueva

En `src/lib/utils.ts`, agregar:
```text
formatDateDisplay(dateStr: string | null) => string
  - Recibe una fecha ISO string (yyyy-MM-dd o ISO datetime)
  - Retorna formato dd/MM/yyyy
  - Retorna "—" si es null/undefined
```

### Archivos a modificar (10 archivos)

**1. `src/lib/utils.ts`**
- Agregar la funcion `formatDateDisplay`

**2. `src/pages/QuotesPage.tsx`**
- Linea 64: `{q.start_date} → {q.end_date}` → usar `formatDateDisplay`
- Linea 118: mismo patron en tabla desktop
- Linea 121: `{q.valid_until}` → usar `formatDateDisplay`

**3. `src/pages/QuoteDetail.tsx`**
- Linea 163: `{quote.start_date} → {quote.end_date}` → formatear
- Linea 164, 171: `{quote.valid_until}` → formatear

**4. `src/pages/ContractsPage.tsx`**
- Lineas 60, 107, 108: fechas de inicio/fin de contratos

**5. `src/pages/MaintenancePage.tsx`**
- Linea 95: `{log.performed_at}` en tarjeta movil
- Linea 98: `{log.next_service_date}` en tarjeta movil
- Linea 176: `{log.performed_at}` en tabla desktop

**6. `src/pages/DeliveriesPage.tsx`**
- Linea 84: `{d.scheduled_date}` en tarjeta movil
- Linea 164: `{d.scheduled_date}` en tabla desktop

**7. `src/pages/InvoiceForm.tsx`**
- Linea 224: fechas en selector de reservas `({b.start_date} → {b.end_date})`

**8. `src/components/PostInspectionInvoiceDialog.tsx`**
- Linea 51: `{booking.start_date} → {booking.end_date}`

**9. `src/components/dashboard/RecentActivity.tsx`**
- Linea 50: cambiar `"MMM d, HH:mm"` a `"dd/MM HH:mm"`

**10. Paginas del portal de clientes**
- `src/pages/portal/PortalDashboard.tsx` linea 79
- `src/pages/portal/PortalRentals.tsx` lineas 36, 37

### Nota
Los usos de `format(date, "yyyy-MM-dd")` para **enviar datos a la base de datos** NO se modifican — esos son correctos como formato de almacenamiento. Solo se corrigen las fechas visibles al usuario.
