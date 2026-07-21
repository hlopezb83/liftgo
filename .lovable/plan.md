## Bloque 4 — Bajos de UX

Aplico los 5 puntos del bloque priorizando visibilidad para el usuario final. Cambios acotados a frontend/presentación.

### 4.1 Flash móvil (impacto visual alto)
`src/hooks/use-mobile.tsx`: cambiar `initializeWithValue: false` → `true` en ambos hooks. Elimina el "flash" de layout mobile ↔ desktop en la primera pintura (sidebar, tablas vs MobileCardList, viewport-conditional UI).

### 4.2 Touch targets ≥44px (accesibilidad táctil)
`src/components/ui/button.tsx`: variantes `icon` y `iconSm` añaden `touch:h-11 touch:w-11` para cumplir 44×44 en dispositivos táctiles, alineado con `MainLayout.tsx:82`. Sin cambios en desktop.

### 4.3 SwipeableCard accesible por teclado
`src/components/feedback/SwipeableCard.tsx`: añadir botón "Acciones" que aparece en `focus-within` del card (u `onKeyDown` con Enter/Space) para revelar/ocultar `rightActions`. Permite operar el swipe sin gesto táctil (teclado, lectores de pantalla).

### 4.4 Micro-copy y Portal
- Unificar spinner label a `"Guardando…"` (elipsis Unicode `…`, no `...`) en los 12 archivos detectados: `ChangePasswordDialog`, `SetPasswordDialog`, `ContractTemplateTab`, `CompanyLogoTab`, `PacConfigForm`, `CompanyFiscalForm`, `PartFormDialog`, `RecordPaymentDialog` (mantener "Timbrando REP…"), `EditPaymentDialog`, `CxpApprovalTab` (dejar "Guardar umbral"), etc.
- `src/features/portal/pages/PortalStatement.tsx:92`: reemplazar `<input type="checkbox">` nativo por `<Checkbox>` de `@/components/ui/checkbox` + `<Label htmlFor>` asociado.

### 4.5 "Cancelar CFDI" bajo RoleGuard
`src/features/invoices/components/invoice-detail/InvoiceDetailActions.tsx`: envolver el botón "Cancelar CFDI" (línea 127) en `<RoleGuard module="Facturas" minAccess="full">`, consistente con las demás acciones destructivas del componente.

### Verificación
- `tsc --noEmit` (tsgo) y `bun run lint`.
- Playwright rápido: portal statement (checkbox), invoice detail (botón oculto sin permisos full), sidebar sin flash en viewport móvil.

### Changelog
Nueva entrada **v7.139.0** (minor: mejoras UX visibles) en `public/changelog.json` + `public/changelog/v7.139.0.json`.

### Fuera de alcance
Bloque 5 (Sentry, .env, version.json, tests, logout) y Bloque 6 (optimistic locking) — se abordan en sprints siguientes.
