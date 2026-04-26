# 📋 Auditoría Arquitectónica — v5.40.1

## Estado actual

✅ **0 errores TypeScript**
✅ **0 usos de `any`** (auditado en mensajes anteriores)
⚠️ **1 error ESLint** + **49 warnings** (complejidad/longitud — ningún issue de seguridad o tipos)

La arquitectura está **limpia y modular**. No hay misplaced logic crítica ni acoplamientos peligrosos. Las mejoras restantes son **refinamiento de modularización** en componentes que excedieron 150 líneas o complejidad ciclomática 15.

---

## 🎯 Top 5 mejoras (ejecutables en 1 paso)

### 1. **Corregir único error de ESLint** — `tailwind.config.ts:118`
Reemplazar `require("tailwindcss-animate")` por `import` ESM al inicio del archivo. Es el único error bloqueante.

### 2. **Modularizar `BookingActions.tsx` (243 líneas)**
Extraer los handlers de transición de estado (confirm/start/complete/cancel) a un hook `useBookingActions.ts` y dejar el componente como UI pura con `<DropdownMenu>`. Reduce ~100 líneas y elimina warning de complejidad.

### 3. **Modularizar `ReportDamageDialog.tsx` (228 líneas, complejidad 24)**
Extraer:
- `useReportDamageForm.ts` — estado del formulario y submit handler
- `DamageEvidenceSection.tsx` — bloque de fotos/dropzone

Deja el dialog como contenedor (~80 líneas).

### 4. **Modularizar `IncomeStatementReport.tsx` (254 líneas)**
Extraer:
- `IncomeStatementTable.tsx` — render de filas + totales
- `IncomeStatementToolbar.tsx` — selector de mes y export PDF

El componente padre queda como orquestador.

### 5. **Dividir `MaintenancePartsSection.tsx` (238 líneas)**
Separar en:
- `MaintenancePartsTable.tsx` — tabla read-only de partes consumidas
- `AddMaintenancePartDialog.tsx` — diálogo de selección/cantidad

---

## 🛠 Verificación post-cambio

- `tsc --noEmit` → 0 errores (mantener)
- `eslint .` → **0 errores**, warnings ≤ 35 (de 50 actuales)
- `public/changelog.json` → bump a **v5.41.0** (minor, refactor estructural)

---

## ⏭ Mejoras opcionales (NO incluidas, baja prioridad)

- `MaintenancePage.tsx` (261 líneas) — ya usa hooks, solo necesita extraer Kanban toolbar.
- `GanttChart.tsx` (236 líneas) — complejidad inherente al render SVG, refactor riesgoso.
- `ContractDetail.tsx` (complejidad 27) — composición ya buena, dividir en tabs sería cosmético.

---

**¿Procedo con las 5 mejoras?** Al aprobar, ejecutaré todo en una sola pasada y actualizaré `changelog.json` a v5.41.0.
