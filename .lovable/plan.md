
# Lote R5 — Business Logic + Spacing System

Ejecuto los 3 bloques del reporte R5 en orden. Sin tocar los fixes previos (timezone, `isPending`, trigger divisa, claim CFDI, RoleGuards de página, soft-delete).

---

## Bloque 1 — Business Logic (5 fixes con tests)

**1.1 CollectionForecast suma USD como MXN**
Archivo real: `src/features/dashboard/components/dashboard/CollectionForecast.tsx`. La `interface OverdueInvoice` sólo recibe `balance` crudo. Verificar quién lo alimenta (dashboard hooks) y propagar `balance_mxn` desde `list_invoices_with_balance` (ya expuesto). Ajustar la interfaz para aceptar `balance_mxn` y usarlo con fallback a `convertToMxn(balance, currency, exchange_rate)` en `src/lib/money`. Test unitario con mezcla MXN/USD.

**1.2 "Nueva Factura" visible para read-only**
`src/features/invoices/components/list/InvoicesToolbar.tsx` (ruta real): envolver el botón en `<RoleGuard module="Facturas" minAccess="full" fallback={null}>`. En `src/routes/routes.ts`/`routes-config`, aplicar `minAccess="full"` a `/invoices/new` como ya lo tiene `/invoices/:id/edit`.

**1.3 RoleGuard apilando `<NoAccess/>`**
`src/layouts/RoleGuard.tsx` ya acepta prop `fallback` — falta usarla. Pasar `fallback={null}` en los usos a nivel botón/sección: `InvoiceDetailActions.tsx` (Editar/Timbrar/Registrar Pago/Cancelar/Eliminar) y auditar otros consumidores de sección (QuoteDetailActions, DeliveryActions, ProspectActions, BookingActionDialogs, CollectionNotesCard, RecordPaymentDialog, etc.) para añadir `fallback={null}` donde no sean rutas completas.

**1.4 DatePickerField −1 día en display**
`src/components/forms/DatePickerField.tsx` y `src/components/forms/fields/DateField.tsx`. El prop es `Date` pero consumidores pasan `new Date("YYYY-MM-DD")` (UTC). Aceptar también `string` date-only y parsear con `parseDateLocal` de `src/lib/utils.ts` antes de formatear. Test TZ Monterrey vs UTC.

**1.5 RecurringBillingBadge**
`src/features/bookings/components/bookings/RecurringBillingBadge.tsx`: cambiar `addMonths(lastBilled, 1)` a `startOfMonth(addMonths(lastBilled, 1))`. Si `generate-recurring-invoices` exporta una regla equivalente, reutilizarla. Caso sin historial: fin del mes de arranque → día 1 del siguiente. Test unitario.

---

## Bloque 2 — Quick wins de espaciado

1. `Dashboard.tsx` grid principal `gap-4` → `gap-6`.
2. `ListPageLayout.tsx` `space-y-4 sm:space-y-6` → `space-y-6`.
3. `AccountsPayableKpiCards.tsx`: `gap-3` → `gap-4`; grid `sm:grid-cols-2` → `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`.
4. `TotalsSummary` (detalle de factura): normalizar `tax_rate` — si `<=1` multiplicar por 100 (o usar helper compartido). Ubicar la ruta real (`src/components/domain/TotalsSummary.tsx` o feature-specific).
5. `PortalInvoiceDetail.tsx`: eliminar `-mt-2` del back-link.

---

## Bloque 3 — Sistema de tokens de espaciado

1. **Unificar KPI cards en `KpiTile`** (`src/components/domain/KpiTile.tsx`): añadir soporte icono, variantes intent, layout móvil horizontal. Migrar `AccountsPayableKpiCards` y `PortalStatCard` a usarlo.
2. **Purgar overrides ad-hoc**: `gap-3`, `pb-2/3`, `pt-4`, `py-4`, `p-3`, `-mt-2` en Card*. Añadir prop `density="compact"` documentada en `card.tsx` para casos legítimos.
3. `line-clamp-2` en labels de `KpiTile`.
4. **StatusBadge soft**: `src/components/feedback/StatusBadge.tsx` — pasar de fondo sólido a fondo tinte 12% + texto oscurecido + borde 1px. Verificar contraste WCAG AA (≥4.5:1) en light/dark.
5. **Pregunta de producto** (documentar en changelog, no código): confirmar si en móvil las alertas deben ir antes de los KPIs de flota.

---

## Detalles técnicos

- Cada bloque = commit + entrada en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json`. Versiones tentativas: **v7.151.0** (Bloque 1), **v7.151.1** (Bloque 2), **v7.152.0** (Bloque 3, cambios estructurales de UI).
- Tests: `bunx vitest run` para 1.1/1.4/1.5 + StatusBadge contrast (visual manual). Ejecutar `tsgo --noEmit`, `deno fmt --check` en supabase/functions, `bunx knip`.
- Verificación visual con Playwright en 1600x900 para spacing (Dashboard, ListPage, AccountsPayable, PortalInvoiceDetail) y para StatusBadge (Invoices, Bookings, Quotes).
- No modificar RPCs ni migraciones. Todo frontend.

## Fuera de alcance

- Refactor global de todos los overrides de padding en cada Card (sólo los listados). Auditoría exhaustiva → sprint aparte si aparecen muchos.
- Decisión de reordenar dashboard móvil (queda como pregunta pendiente, no cambio).
