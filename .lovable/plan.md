## Estado verificado de cada DIFF

| DIFF | Estado | Acción |
|---|---|---|
| **C4a** literal query keys | ✅ 0 hallazgos en `src/features` (grep vacío) | Skip — ya cerrado en lotes previos |
| **C4b** consolidar `company_settings` | 🟡 Existe `useCompanySettings`, pero `src/lib/pdf/shared.ts`, `pdf/contract/fetchers.ts`, `cash-flow/useCashFlowSettings.ts` y `company-settings/useCxpApprovalThreshold.ts` lo leen por su cuenta (namespaces de cache distintos) | **Aplicar** |
| **C4c** `computeInvoiceFlags` NC-aware | ✅ `isPayable = status ∈ {sent, overdue}`. No hace `total-paid` inline; los status vienen de triggers sobre `v_invoices_with_balance` | Skip — no hay bug |
| **C5a** `delete_booking` RPC | 🔴 `useDeleteBooking` hace `DELETE` crudo sin actualizar `forklift.status` ni `status_logs` | **Aplicar** |
| **C5b** soft-delete financiero | ⚪ Opcional; borradores ya no aparecen en reportes; audit trigger cubre trazabilidad | Skip con justificación |
| **C6** `select("*")` restantes | ✅ 0 hallazgos (`v7.216.0`) | Skip — cerrado |
| **C8** tests users/auth/returns/calendar | ⚪ ~8-10 archivos de test nuevos | Skip — sprint dedicado |
| **C9** `useProspectForm` RHF+zod | 🔴 Sigue con `useState` + `validateDealValue` manual, email sin `z.email()` real | **Aplicar** |
| **C10** realtime | ⚪ Marcado opcional explícito; costo de conexiones sin caso de uso confirmado | Skip |
| **C11.1** deprecar `formatDateDisplay` (55 files) | ⚪ Migración masiva | Skip — sprint aparte |
| **C11.2** borrar muertos (knip) | ⚪ Ya ejecutado en lotes previos | Skip |
| **C11.3** README + `name` en `package.json` | 🟡 Trivial | **Aplicar** |
| **C11.4** `set_prospect_created_by` `search_path` | 🔴 Falta hardening | **Aplicar** |
| **C11.5** reubicar `useCustomerPortal`/`CustomerPortalRoutes` | ⚪ Refactor amplio de rutas | Skip |
| **C11.6** unificar `FeedbackStatusBadge`/`RepBadge` a `StatusBadge` | 🟡 Cosmético | **Aplicar** |

## Alcance a implementar — v7.217.0

### 1. C4b — Consolidación de `company_settings`
- Ampliar `src/features/company-settings/lib/queryKeys.ts` con `defineEntityQueries` (fetchOne singleton).
- Migrar consumidores externos a `useCompanySettings()` con `select` derivado:
  - `src/lib/pdf/shared.ts` (`fetchCompanyDataAndLogo`) → helper que llama al mismo cache
  - `src/lib/pdf/contract/fetchers.ts`
  - `src/features/cash-flow/hooks/useCashFlowSettings.ts` — mantiene su columna propia pero comparte cache-key
  - `src/features/company-settings/hooks/useCxpApprovalThreshold.ts` → `useCompanySettings({ select })`
- Colapsar los 3 namespaces de cache en uno solo (`companySettingsKeys.detail("singleton")`).

### 2. C5a — RPC `delete_booking`
- Migración `SECURITY DEFINER` + `SET search_path=public` siguiendo la plantilla del diff, adaptada a nuestro modelo (`status ∈ draft|cancelled`, log en `status_logs`, reset de forklift a `available` si no hay otras reservas activas).
- `useDeleteBooking` pasa a `supabase.rpc("delete_booking", { p_booking_id })`.
- Test unitario del hook con el mock de `rpc`.

### 3. C9 — `useProspectForm` a RHF + zod
- Crear `prospectFormSchema` en `src/features/crm/lib/` (nombre, email real vía `z.string().email()`, phone con `phoneSchema` común, `dealValue` numérico > 0 en stages que lo requieran).
- Reescribir `useProspectForm` como wrapper de `useForm<Prospect>` con `zodResolver`.
- Ajustar `ProspectFormFields` para consumir `FormField` de shadcn.
- Eliminar `validateDealValue` manual + regex de email.

### 4. C11.4 — Hardening `set_prospect_created_by`
- Migración que reemplaza la función con `SET search_path = public`.

### 5. C11.6 — StatusBadge unificado
- Añadir mapeos `feedback` y `rep` al `StatusBadge` central.
- Reemplazar callsites (`FeedbackStatusBadge`, `RepBadge`) por `StatusBadge` con el `domain` apropiado.
- Borrar los dos componentes duplicados.

### 6. C11.3 — Metadatos
- `package.json`: `"name": "liftgo"`.
- README con stack real (React 19 + Vite 8 + @react-pdf/renderer + Lovable Cloud/Supabase).

### 7. Cierre
- `bash scripts/arch-check.sh` verde.
- `bunx tsgo --noEmit` verde.
- `bun test` verde (nuevos tests de C5/C9 incluidos).
- Bump `v7.217.0` + entrada en `public/changelog.json` y `public/changelog/v7.217.0.json`.

## Justificación de skips clave
- **C5b (soft-delete financiero)**: introduce deuda (nueva columna + filtros en cada vista + RPCs de recuperación) sin caso de uso operativo. Los borradores hoy ya se excluyen de reportes vía `status='draft'` y el audit trigger conserva el registro post-DELETE.
- **C4c**: el diff pide *verificar*, no cambiar. Verificado: `isPayable` deriva del `status` que a su vez es actualizado por triggers server-side sobre `v_invoices_with_balance`. NC-aware por transitividad.
- **C8 / C10 / C11.1 / C11.5**: alcance de sprint independiente; mezclarlos con este lote convierte el release en no-verificable.
