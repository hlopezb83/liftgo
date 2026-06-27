## Fase 2 de la auditoría UI/UX: cohesión de tokens semánticos

La v6.98.0 ya cerró los bugs críticos (ruta 404, sidebar, título "Equipos", variante `warning` del Alert). El siguiente bloque ataca los hallazgos de cohesión que quedaron documentados pero no aplicados.

### Alcance propuesto

**1. Auditoría y migración de colores hardcodeados a tokens semánticos**
- Barrer `text-(red|amber|green|blue|yellow)-[0-9]+`, `bg-…-[0-9]+`, `border-…-[0-9]+` y `[#hex]` en todo `src/`.
- Mapeo objetivo:
  - rojo → `text-destructive` / `bg-destructive/10`
  - ámbar/amarillo → `text-warning` / `bg-warning/10`
  - verde → `text-success` / `bg-success/10` (crear token `--success` si no existe)
  - azul → `text-info` / `bg-info/10` (crear token `--info` si no existe)
- Excluir: charts (`text-chart-*` ya es token), logo, gradientes intencionales.
- Resultado: dark mode consistente, sin overrides puntuales.

**2. Ampliar variantes de Alert**
- Añadir `success` e `info` a `src/components/ui/alert.tsx`.
- Migrar avisos restantes (sospechosos en CRM, Reservas, Mantenimiento, Conciliación) que aún usan `Alert variant="destructive"` con overrides `amber/green/blue`.

**3. Componente `PageToolbar` compartido**
- Crear `src/components/layout/PageToolbar.tsx` que envuelva ToggleGroup + acciones con `gap-2`, `size="sm"` y orden consistente (vista → exportar → secundarias → primaria).
- Migrar tres ejemplos representativos: `MaintenancePageActions`, `BookingsPageActions`, `InvoicesPageActions` (si existen).
- Las demás páginas quedan documentadas para una pasada posterior.

**4. Estandarizar iconografía de acciones primarias**
- Regla: `Plus` para "crear/agregar", `Pencil` para editar, `Trash2` para eliminar, `Download` para exportar.
- Reemplazar `PlusCircle`, `Edit`, `Trash`, `FileDown` residuales con un sweep de `rg`.

**5. Changelog y verificación**
- Versión `v6.99.0` (minor, mejora de sistema de diseño).
- Verificación: `bun run lint`, `bun run build`, y captura Playwright del Estado de Resultados, Mantenimiento y Conciliación para confirmar que los colores de avisos siguen leyéndose bien en claro y oscuro.

### Detalles técnicos

- Si faltan tokens `--success` / `--info`, agregarlos a `src/index.css` (raíz y `.dark`) y a `tailwind.config.ts` siguiendo el patrón ya usado por `warning`.
- El sweep usará `rg --no-heading "(text|bg|border)-(red|amber|yellow|green|blue|emerald|rose)-(50|100|200|300|400|500|600|700|800|900)" src/` para generar la lista exhaustiva antes de editar.
- Cada migración se hace con `line_replace` puntual, no rewrites masivos, para mantener diffs revisables.
- `PageToolbar` recibirá `view?`, `secondaryActions?`, `primaryAction?` como props tipados; no romperá las páginas que sigan usando layout propio.

### Fuera de alcance

- Cambio de tipografía o spacing global (no hay hallazgos).
- Refactor de `KpiCard` (ya consistente).
- Migración de páginas que no usan `PageHeader` (Dashboard, AgingReport, MrrDetail, CRMClosed) — bajo impacto visual; se deja para una pasada futura si el usuario lo pide.
