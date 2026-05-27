## v6.13.3 — Patch de calidad (cierra hallazgos LOW de la auditoría)

La auditoría `/skill:audit-code-quality` arrojó **0 CRITICAL, 0 HIGH, 2 LOW**. Este patch los cierra. Sin cambios de lógica de negocio.

### Hallazgo #10 — Colores del Kanban CRM fuera del design system

`src/features/crm/lib/constants.ts:27-29` tiene tres literales `hsl(210 80% 55%)`, `hsl(45 93% 47%)`, `hsl(280 60% 55%)` para los stages del Kanban. Rompe la regla "nunca colores literales en componentes".

**Cambio:**
- `src/index.css` (bloque `:root` y `.dark`): agregar cuatro tokens semánticos.
  ```css
  --crm-stage-new: var(--primary);
  --crm-stage-contacted: 210 80% 55%;
  --crm-stage-quoted: 45 93% 47%;
  --crm-stage-negotiating: 280 60% 55%;
  ```
- `src/features/crm/lib/constants.ts`: reemplazar literales por `hsl(var(--crm-stage-*))`.

### Hallazgo #4 — Auditoría §20 desactualizada

`src/hooks/useFormState.ts` ya no existe (todos los diálogos migrados a react-hook-form), pero `docs/dependency-audit.md` aún lo lista como `MIGRAR pendiente`.

**Cambio:**
- `docs/dependency-audit.md` línea 27: cambiar a `RETIRADO (v6.13.3)` con nota de que todos los diálogos están en RHF.

### Changelog (regla del proyecto)

- `public/changelog.json`: nueva entrada al inicio del array, versión `6.13.3`, tipo `patch`, categoría `refactor`.
- `public/changelog/v6.13.3.json`: detalle completo con los dos cambios y el resumen de auditoría (0/0/0 abiertos tras el patch).

### Verificación

- `bun run lint` → 0 errores.
- `bunx vitest` → 296/296 verdes (sin tocar lógica).
- Inspección visual del Kanban CRM en `/crm`: los cuatro stages mantienen los mismos colores (los tokens preservan los valores HSL originales).

### Fuera de alcance

- Bloque C (runbooks/backup/restore) — pendiente, se entrega como `v6.13.4+` cuando lo indiques.
- Migración del label de los stages a un componente `StageBadge` (no es un hallazgo de auditoría).
