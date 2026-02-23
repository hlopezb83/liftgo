# Plan de Refactorizacion

## Estado: ✅ Fase 1 completada | ✅ Fase 2 completada

### Fase 1
1. ✅ Traducciones SERVICE_TYPES, AuthGuard, DamageTrackingPage
2. ✅ Eliminados `as any` en CustomersPage e InvoiceForm
3. ✅ Creados SearchBar, useListFilters, ListPageLayout
4. ✅ Migrado QuotesPage y DamageTrackingPage a ListPageLayout
5. ✅ Simplificado App.tsx con RouteConfig array

### Fase 2
1. ✅ Fechas con locale `es` (ForkliftDetail, CalendarPage, ActivityPage, ReturnInspectionPage, DateRangePickerField)
2. ✅ FUEL_TYPE_LABELS y FUEL_LEVEL_LABELS (Fleet, ForkliftDetail, ForkliftForm, ReturnInspectionPage, OperationsSetupPage)
3. ✅ Eliminados `as any` en useContracts, usePayments, useAuditLogs
4. ✅ OperationsSetupPage extraído a EquipmentModelsTab, DriversTab, MechanicsTab
5. ✅ Condiciones de inspección traducidas en ReturnInspectionPage
6. ⏭️ Migración de páginas restantes a ListPageLayout — omitido (vistas mobile/desktop duales reducen el beneficio)
