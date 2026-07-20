## Auditoría Ola 3.2

**Estado verde:** typecheck limpio, 1095/1095 Vitest pasan (incluye los 19 tests directamente afectados por EC-M1 y por la migración de ContractForm a RHF).

**Sin bugs detectados en lo entregado**, pero hay huecos de cobertura y follow-ups explícitos del changelog v7.124.0 que conviene cerrar antes de avanzar a temas nuevos:

- `useUnsavedChangesGuard` se wireó en `InvoiceForm` (Ola 3.1) y `ContractForm` (Ola 3.2) sin tests unitarios.
- La nueva validación Zod de `ContractForm` (cliente/equipo requeridos, tarifas ≥ 0, `end_date >= start_date`) no tiene test que verifique que los errores se muestran inline y bloquean el submit.
- El prefill de contrato (booking/equipo/template) usa `shouldDirty:false` — sin test que garantice que el guard **no** dispare en autofills.
- **EC-A4** (Profitability por modelo hoy en client-side sujeto a límites PostgREST) sigue pendiente.
- **UX-M1 QuoteForm** queda diferido — es el que más superficie tiene y va en su propio sprint.

---

## Plan Ola 3.3 — Cobertura de Ola 3.2 + EC-A4 (server-side)

### Alcance

**A) Tests de la migración de Ola 3.2**

1. `src/hooks/__tests__/useUnsavedChangesGuard.test.tsx` (nuevo)
   - Renderiza el hook con `isDirty=true`/`false` dentro de un `MemoryRouter`.
   - Verifica que `beforeunload` sólo bloquea navegación cuando `isDirty=true`.
   - Verifica que un `false → true → false` deja de bloquear correctamente (cleanup).

2. `src/features/contracts/pages/__tests__/ContractForm.test.tsx` (nuevo)
   - Renderiza el form con providers mínimos (QueryClient + Router).
   - Submit sin cliente/equipo → aparecen `FormMessage` "Cliente requerido" / "Equipo requerido" y `createContract` NO se llama.
   - `end_date < start_date` → aparece el error del refine y bloquea submit.
   - Éxito: submit con datos válidos llama a `createContract.mutate` con el payload esperado y navega a `/contracts/:id`.

3. `src/features/contracts/hooks/contractForm/__tests__/useContractFormPrefill.test.tsx` (nuevo)
   - Monta el hook con un booking mock y confirma que `form.formState.isDirty === false` después del autofill (blindaje del guard).

**B) EC-A4 — RPC server-side para Profitability por Modelo**

4. Nueva migración `supabase/migrations/[ts]_report_profit_by_model.sql`
   - `CREATE FUNCTION public.report_profit_by_model(_start date, _end date) RETURNS TABLE(model text, units int, revenue numeric, maintenance numeric, damages numeric, profit numeric, margin numeric)`.
   - `SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE ... TO authenticated`.
   - Agrega en SQL sobre `forklifts` + `bookings` + `invoices` + `maintenance_logs` + `damage_records` con la misma semántica que `profitabilityHelpers` (facturas `paid` con `paid_at` en rango, costos por `performed_at`/`created_at` en rango, agrupado por `manufacturer||' '||model`).

5. Nuevo `src/features/reports/hooks/useProfitByModelReport.ts`
   - `useQuery` que llama `supabase.rpc('report_profit_by_model', { _start, _end })`.
   - Query key `["report", "profit-by-model", start, end]`.

6. Refactor `src/features/reports/components/reports/ProfitabilityByModelReport.tsx`
   - Elimina los 5 `useX()` que cargaban toda la app y pasa a consumir el hook nuevo.
   - `chartRows` / tabla / CSV se alimentan directamente de las filas del RPC.
   - Estado de error se propaga a `ListPageLayout` / mensaje inline.
   - Se conservan `profitabilityHelpers` y sus tests (siguen usados por consumidores puros / documentación); si nadie más los importa, se marcan para retirar en Ola 3.4.

### Detalles técnicos

- El RPC devuelve `numeric` para todas las métricas; el frontend formatea con `formatCurrency` / `.toFixed(1)` como hoy.
- Rango se pasa como `date` (no `timestamptz`) para evitar el mismo problema de zona horaria que EC-M1 arregló en cliente.
- `margin` se calcula en SQL con `CASE WHEN revenue > 0 THEN profit/revenue*100 ELSE 0 END`.
- El hook nuevo respeta el patrón `LIST_PAGE_LIMIT` — el RPC ya agrega, no necesita `.limit()`.
- Test de integración con Supabase mockeado (siguiendo el patrón de `useContracts.rls.test.ts`).

### Fuera de alcance (queda para Ola 3.4)

- Migración de `QuoteForm` a RHF+Zod (line-items subforms — es sprint completo).
- Retiro de `profitabilityHelpers` si tras EC-A4 nadie más los consume.

### Verificación al cierre

- `bunx tsgo --noEmit` limpio.
- `bunx vitest run` — se agregan ~5 tests nuevos, esperado ≥1100 pasando.
- Migración aplicada y RPC probado desde el UI.
- Entrada nueva en `public/changelog.json` + `public/changelog/v7.125.0.json`.
