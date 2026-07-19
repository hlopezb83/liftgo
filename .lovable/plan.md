## Sprint UX/UI + residuos BL — 9 issues (11 hallazgos)

Sigo el orden sugerido por la auditoría. Cada issue = un commit con su changelog patch/minor.

### Fase 1 — Residuos BL (cierra la serie BL)

**ISSUE-001 · BL-46 — `toggle-user-status` guarda de último admin**

- `supabase/functions/toggle-user-status/index.ts`: antes de `setUserActive`, si `is_active === false` y el objetivo tiene rol `admin`, contar admins activos restantes; si 0 → 400.
- Reutilizar patrón exacto de `delete-user/index.ts`.
- Test Deno nuevo cubriendo: 1 admin (rechaza), 2+ admins (permite), desactivar no-admin (permite).

**ISSUE-002 · BL-47 — `revert_audit_log` excluye tablas financieras**

- Migración: modificar `revert_audit_log` para `v_allowed_tables := ARRAY['forklifts','customers','contracts','deliveries','maintenance_logs','damage_records','quotes','return_inspections']` (fuera `bookings`, `invoices`, `payments`).
- Mensaje de error explícito indicando usar flujos de negocio (cancelación SAT, notas de crédito, eliminación con re-sync).
- Test: agregar caso a `src/test/` o Deno confirmando rechazo en `payments`.

### Fase 2 — Portal cliente (superficie externa)

**ISSUE-003 · UX-08 — `mobileCardRender` en las 4 páginas del portal**

- `PortalInvoices.tsx`, `PortalQuotes.tsx`, `PortalRentals.tsx`, `PortalContracts.tsx`: añadir `mobileCardRender` con número + `StatusBadge` + fecha + monto + CTA contextual ("Ver/Descargar", "Revisar y aceptar").
- Actualizar `tests/e2e/visual-mobile.spec.ts` agregando `/portal/invoices` y `/portal/quotes` (autenticando como cliente).

### Fase 3 — Defectos visibles con captura

**ISSUE-004 · UX-01/02 — Barras de acciones (Mantenimiento y CxP)**

- `MaintenancePageActions.tsx` y `CuentasPorPagarPage.tsx` actions: `flex flex-wrap gap-2`; etiquetas secundarias con `hidden sm:inline`, iconos siempre visibles.

**ISSUE-005 · UX-03 — Sección CFDI apila en móvil**

- `CfdiFieldsCard.tsx:18,63`: `grid-cols-2 sm:grid-cols-3` → `grid-cols-1 sm:grid-cols-3` y `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`.
- `ReceptorFiscalFields.tsx:13,27`: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`.

### Fase 4 — Barrido transversal

**ISSUE-006 · UX-09 — 56 `grid-cols-N` sin breakpoint en diálogos**

- Barrido con `rg "grid-cols-[23]"` en los diálogos de formulario (`*FormDialog.tsx`, secciones dentro de `Card`+`Dialog`).
- Reemplazar `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` y `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`.
- Excepciones (mantener): thumbnails (`DamageEvidenceSection`), specs llave-valor (`ForkliftSpecsCard`), filas qty/precio/total (`RentalLineRow`). Documentar en el changelog.

### Fase 5 — Pulido

**ISSUE-007 · UX-04 — Fade lateral en Gantt móvil**

- Contenedor scrollable del calendario/Gantt: `[mask-image:linear-gradient(to_right,black_92%,transparent)]` + hint `text-xs text-muted-foreground sm:hidden` "Desliza →".

**ISSUE-008 · UX-05 — Capitalización "Julio de 2026"**

- `CalendarPage.tsx:115`: quitar clase CSS `capitalize`; capitalizar sólo primera letra vía `label.charAt(0).toUpperCase() + label.slice(1)`.

**ISSUE-009 · UX-06/07 — Configuración: tabs + catálogos móvil**

- Tablist con `overflow-x-auto` + fade (o `<Select>` a `<768px`).
- Catálogos (Modelos, Operadores, Mecánicos, Pólizas): `mobileCardRender`.

### Changelog

Cada fase genera una entrada en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json`:

- v7.104.0 (fase 1 — BL-46/47, minor por cambio de contrato de RPC)
- v7.104.1 (fase 2 — portal cards)
- v7.104.2 (fase 3 — barras + CFDI)
- v7.104.3 (fase 4 — barrido grids)
- v7.104.4 (fase 5 — pulido)

### Verificación

- `tsgo` + `bunx vitest run` tras cada fase.
- Deno tests para fase 1.
- Playwright a 390×844 para fases 2-5 en las páginas modificadas (screenshots comparativos).
- Playwright a 1920×1080 para confirmar cero regresión en escritorio.  
  
Corrige todo en una pasada.