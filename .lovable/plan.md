

## Estandarizar formato de fechas a DD/MM/AAAA en toda la aplicacion

### Problema
Las fechas se muestran actualmente en formato `"d MMM yyyy"` (ej. "2 mar 2026") o con `PPP` / `toLocaleDateString()` sin locale. El estandar mexicano es **DD/MM/AAAA** (ej. "02/03/2026").

### Alcance
Solo se modifican fechas de **visualizacion**. Las fechas para almacenamiento en base de datos (`"yyyy-MM-dd"`) no se tocan.

### Archivos a modificar (18 archivos)

| Archivo | Formato actual | Formato nuevo |
|---|---|---|
| `src/components/DatePickerField.tsx` | `PPP` | `dd/MM/yyyy` con locale es |
| `src/components/DateRangePickerField.tsx` | `d MMM yyyy` / `d MMM` | `dd/MM/yyyy` / `dd/MM` |
| `src/components/RecurringBillingBadge.tsx` | `d MMM yyyy` | `dd/MM/yyyy` |
| `src/components/forklift-detail/ForkliftBookingsList.tsx` | `d MMM` / `d MMM yyyy` | `dd/MM` / `dd/MM/yyyy` |
| `src/components/forklift-detail/ForkliftStatusHistory.tsx` | `d MMM yyyy HH:mm` | `dd/MM/yyyy HH:mm` |
| `src/components/forklift-detail/ForkliftMaintenanceList.tsx` | `d MMM yyyy` | `dd/MM/yyyy` |
| `src/components/calendar/EquipmentListView.tsx` | `d MMM` / `d MMM yyyy` | `dd/MM` / `dd/MM/yyyy` |
| `src/components/calendar/GanttChart.tsx` | `d MMM` / `d MMM yyyy` | `dd/MM` / `dd/MM/yyyy` |
| `src/pages/BookingsPage.tsx` | `d MMM yyyy` | `dd/MM/yyyy` |
| `src/pages/CalendarPage.tsx` | `d MMM` / `d MMM yyyy` | `dd/MM` / `dd/MM/yyyy` |
| `src/pages/DamageTrackingPage.tsx` | `d MMM yyyy` | `dd/MM/yyyy` |
| `src/pages/ReturnInspectionPage.tsx` | `d MMM yyyy` | `dd/MM/yyyy` |
| `src/pages/ActivityPage.tsx` | `d MMM yyyy HH:mm` | `dd/MM/yyyy HH:mm` |
| `src/pages/ContractDetail.tsx` | `toLocaleDateString()` | `format(... "dd/MM/yyyy")` |
| `src/pages/UserManagementPage.tsx` | `toLocaleDateString()` | `format(... "dd/MM/yyyy")` |
| `src/pages/AuditTrailPage.tsx` | `toLocaleDateString()` + `toLocaleTimeString()` | `format(... "dd/MM/yyyy HH:mm")` |
| `src/pages/HelpPage.tsx` | `toLocaleDateString("es-MX", ...)` | `format(... "dd/MM/yyyy")` |
| `src/pages/InvoicesPage.tsx` | verificar si tiene fechas con formato incorrecto |

### Notas
- Los formatos cortos para rangos (`d MMM`) cambian a `dd/MM` para mantener consistencia
- Los formatos con hora (`HH:mm`) se conservan, solo cambia la parte de fecha
- El label del calendario (`MMMM yyyy` en CalendarPage) se mantiene tal cual porque es un encabezado de mes, no una fecha puntual
- Los PDFs (QuotePDFButton, InvoicePDFButton, ContractPDFButton) usan formatos propios para documentos oficiales y se dejan como estan por ahora

