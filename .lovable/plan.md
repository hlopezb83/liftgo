## Resumen

Auditoría completa de localización es-MX (sólo lectura, sin cambios).

**Bien configurado ya:**
- `APP_CONFIG.LOCALE = "es-MX"`, `TIMEZONE = "America/Monterrey"`.
- `formatCurrency` usa `Intl.NumberFormat(APP_CONFIG.LOCALE, ...)`.
- `formatDateDisplay`, `formatMtyDate`, `nowMty`, `toYMD` centralizados.
- `src/components/ui/calendar.tsx` ya pasa `locale={es}` por defecto a todos los `<Calendar>` del proyecto (semana inicia lunes vía locale `es`).
- Ningún `format()` de date-fns usa patrones con nombres de mes/día (`MMM`, `EEEE`, etc.) sin locale: todos son numéricos (`dd/MM/yyyy`, `HH:mm`).

## Hallazgos

### 1. CRITICAL — `<input type="date">` nativo (formato depende del navegador, en/US muestra MM/DD/YYYY)

Mismo problema que ya corregimos en `ExtendBookingDialog`. Archivos pendientes:

- `src/features/portal/components/ReportTransferDialog.tsx:55` — Portal del cliente: "Fecha de transferencia".
- `src/features/fleet/components/forklift-form/InsuranceSection.tsx:20` — Vigencia del seguro (form de montacargas).
- `src/features/crm/components/CloseWonDialog.tsx:76` — Fecha de cierre ganado en CRM.
- `src/features/invoices/components/invoice-detail/CollectionNotesCard.tsx:59` — Fecha de seguimiento de cobranza.

**Impacto:** usuarios en navegadores con locale ≠ es-MX ven el calendario y picker en su idioma/orden de día-mes incorrecto.

**Fix:** sustituir por el patrón Shadcn `Popover + Calendar` (ya estandarizado en el proyecto vía `DatePickerField`), serializando con `toYMD()`. Riesgo bajo — sólo capa de presentación.

### 2. HIGH — `<input type="time">` nativo (formato 12h/24h depende del navegador)

- `src/features/deliveries/components/deliveries/PostDeliveryPickupDialog.tsx:60`
- `src/features/deliveries/components/deliveries/DeliveryFormFields.tsx:81`
- `src/features/bookings/components/bookings/PostBookingDeliveryDialog.tsx:65`

**Impacto:** algunos navegadores muestran AM/PM, otros 24h; inconsistencia visual.

**Fix:** Opción A — dejarlo (los time inputs son menos problemáticos porque el valor que devuelven siempre es `HH:mm` 24h). Opción B — reemplazar por un `TimePicker` custom. Recomendación: dejar como está salvo que el cliente lo pida (no es bug funcional, solo UX).

### 3. MEDIUM — `toLocaleString()` sin locale

- `src/components/ui/chart.tsx:212` — `item.value.toLocaleString()` en tooltips de gráficas. Usa locale del navegador, no es-MX (separador de miles puede salir con coma en lugar de punto/coma según UA).

**Fix:** cambiar a `item.value.toLocaleString(APP_CONFIG.LOCALE)` o usar `formatNumber()` helper.

### 4. OK — Falsos positivos verificados

- `format(d, "yyyy-MM-dd")` y similares en payloads/keys: correcto, son cadenas técnicas no localizadas.
- `Calendar` en `ExtendBookingDialog`, `DateRangePickerField`, `DatePickerField` heredan `locale={es}` del componente base; el `weekStartsOn={1}` explícito en `ExtendBookingDialog` es redundante pero inocuo.

## Recomendación de orden

Fase 1 (recomendado ahora): arreglar **#1** — los cuatro `<input type="date">` restantes. Mismo patrón ya probado.

Fase 2 (opcional): **#3** — un toque en `chart.tsx`.

Fase 3 (sólo si lo pides): **#2** — time pickers custom.

## Detalles técnicos para implementación posterior

- Cada reemplazo de `<input type="date">` usa: `Popover` + `Calendar mode="single" selected={dateObj} onSelect={setDateObj}`, `formatDateDisplay`/`format(d,"dd/MM/yyyy",{locale:es})` para mostrar, y `toYMD(dateObj)` para serializar a Postgres `date` (regla de memoria).
- En `CloseWonDialog` y `ReportTransferDialog` el estado actual es string `yyyy-MM-dd` desde `format(nowMty(),"yyyy-MM-dd")`; migrar a `Date | undefined` y serializar en submit.
- No tocar lógica de negocio, hooks ni queries.
- Cada fase = una entrada de changelog patch separada.

## Fuera de alcance de esta auditoría

PDFs (ya usan `dd/MM/yyyy` con `nowMty()` correctamente), validaciones Zod, mensajes en español (revisión de copy es otro tema).
