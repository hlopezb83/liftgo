## Auditoría Ola 3.1

Revisado. Sin bugs funcionales; guarda `ErrorState` limpio, `useUnsavedChangesGuard` correcto (blocker + beforeunload + confirm async). Suite 1094/1094 verde.

**Gaps menores detectados** (arrastramos a esta ola):
- `useUnsavedChangesGuard` no tiene test unitario propio.
- `ListPageLayout` no tiene test que valide la ruta `isError` → `ErrorState`.

---

## Siguiente fase — Sprint 3 · Ola 3.2 — UX operativa (cierre)

Cerramos los 3 hallazgos que quedaron abiertos del Sprint 3 del audit (UX-M1, EC-A4, EC-M1) y las dos coberturas pendientes de Ola 3.1.

### UX-M1 · RHF + Zod en ContractForm y QuoteForm
- Migrar `ContractForm` (`useState`+toasts → `useForm` + `zodResolver`) con `contractFormSchema` que valide `customer_id`/`forklift_id` requeridos, `monthly_rate ≥ 0`, `start_date ≤ end_date`.
- Migrar `QuoteForm` con `quoteFormSchema` (montos ≥ 0, fechas coherentes, al menos 1 partida).
- Errores inline via `<FormMessage>` (no toasts) — patrón del resto de la app.
- Wire `useUnsavedChangesGuard(form.formState.isDirty)` en ambos → cierra el follow-up de Ola 3.1.

### EC-A4 · Reporte "Ganancia Neta por Modelo" con filtro server-side
- `ProfitabilityByModelReport` filtra en cliente sobre 500 filas más recientes → reporta menos de lo real en periodos viejos.
- Fix: cambiar los `useInvoices`/`useBookings`/`useMaintenanceLogs`/`useDamageRecords` de la vista por queries con `.gte/.lte` server-side sobre el rango del reporte, o (preferible) mover la agregación a una RPC `report_profit_by_model(_from date, _to date)` que devuelva el resumen ya calculado.
- Decisión de implementación: RPC (más limpio, evita 4 queries paralelas y trunca menos).

### EC-M1 · Off-by-one de día en reportes
- Columnas `DATE` parseadas como UTC midnight se comparan contra rangos locales (`America/Monterrey`) → se pierde el primer día del periodo.
- Fix en `profitabilityHelpers.ts` y utilidades similares: usar `toYMD` para comparar día-a-día (string YYYY-MM-DD), no `new Date(dateStr)`.
- Barrido de otros helpers de reportes que hagan el mismo error (`aging`, `cash-flow` ya lo hace bien vía RPC — verificar).

### Coberturas pendientes de Ola 3.1
- Test unitario `useUnsavedChangesGuard.test.tsx` con `MemoryRouter` verificando: (a) no bloquea si `isDirty=false`; (b) llama `blocker.reset` si el confirm devuelve false; (c) llama `blocker.proceed` si devuelve true; (d) registra/limpia `beforeunload` según flag.
- Test integración `ListPageLayout.test.tsx` con `isError=true` renderiza `ErrorState` y clic en Reintentar dispara `onRetry`.

### Verificación
- Typecheck limpio.
- Vitest completo verde (esperado 1094 + 2 nuevos + los de schemas de contract/quote).
- Smoke visual: `/contracts/new`, `/quotes/new` con errores inline; `/reports/profitability` sobre un rango que antes truncaba.

### Detalles técnicos
- Nuevo `src/features/contracts/lib/contractFormSchema.ts` y refactor de `useContractFormLogic` para retornar `form` de RHF (romperá `updateField` — reemplazar por `form.setValue`/`register`).
- Nuevo `src/features/quotes/lib/quoteFormSchema.ts` — Quote ya tiene subformularios complejos (line items), envolver los existentes como `Controller`.
- Migración RPC EC-A4: `create or replace function public.report_profit_by_model(_from date, _to date)` con `security definer` + `has_role` guard.

### Changelog
- `public/changelog.json` + `public/changelog/v7.124.0.json` como minor.

---

**No incluido a propósito** (siguiente ola):
- EC-A1 (procesador cfdi_retry_queue) y EC-A2 (stamping huérfano) — pertenecen a Sprint 2 Ola 2.3 residual; mejor agruparlos con MP-A1 en una ola de "resiliencia CFDI ronda 2".
- UX-M2..UX-M6, MP-*, y BAJOS — olas posteriores.
