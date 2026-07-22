# Auditoría visual del ERP — plan de ejecución

## Objetivo
Producir un reporte de auditoría visual del ERP en desktop 1600×900 (estándar principal), con capturas antes/después de las rutas críticas y un roadmap priorizado de mejoras de UI/UX aplicables sin tocar lógica de negocio.

## Alcance
- Vista desktop 1600×900 autenticada como admin (sesión inyectada vía `LOVABLE_BROWSER_SUPABASE_*`).
- Rutas críticas: `/` (Dashboard), `/fleet`, `/customers`, `/quotes`, `/bookings`, `/invoices`, `/maintenance`, `/mrr`, `/income-statement`, `/expenses`, `/settings/operations`.
- Se verifica también un caso móvil (390×800) puntual en `/invoices` y `/bookings` para detectar regresiones de `MobileCardList`.
- **No** se modifica lógica de negocio, RPCs, schemas ni edge functions. Solo se propone/aplica trabajo de presentación (tokens, spacing, jerarquía, densidad, estados vacíos, contraste, accesibilidad visual).

## Fases

### Fase 1 — Captura del estado actual
- Script Playwright bajo `/tmp/browser/visual-audit/` que:
  - Restaura sesión Supabase e itera las 11 rutas desktop.
  - Guarda screenshots en `/mnt/documents/ui-audit-v7.181/desktop/*.png`.
  - Repite 2 rutas mobile en `/mnt/documents/ui-audit-v7.181/mobile/*.png`.
- Cada captura acompañada de un `console.log` con URL final + errores de consola detectados.

### Fase 2 — Análisis heurístico
Para cada ruta revisar:
- **Jerarquía visual**: peso tipográfico, uso de `text-lg` para totales monetarios, orden de acciones.
- **Densidad y spacing**: cumplimiento de la regla de tablas compactas zebra + sticky headers.
- **Consistencia de tokens**: cero `bg-white` / `text-gray-*` arbitrarios; uso correcto de `bg-*/10` para KPIs y `text-muted-foreground` para íconos de detalle.
- **Jerarquía de botones**: default único por vista, outline para secundarios, ghost solo en toolbars densas.
- **Estados vacíos y de carga**: `EmptyState` unificado, skeletons coherentes.
- **Accesibilidad visual**: contraste AA con tokens semánticos, `aria-label` en icon-only, tap targets ≥44px en móvil.
- **Breadcrumbs y microcopy** en es-MX.

### Fase 3 — Reporte
Documento `/mnt/documents/ui-audit-v7.181/report.md` con:
- Tabla resumen por ruta: hallazgo, severidad (Crítico / Alto / Medio / Bajo), tipo (token, spacing, jerarquía, a11y, empty-state), captura de referencia.
- Roadmap propuesto en 3 lotes:
  - **Lote A (quick wins)**: tokens, alineaciones, `aria-label`, empty-states inconsistentes.
  - **Lote B (jerarquía y densidad)**: revisión de cards del Dashboard, orden de acciones, columnas Total alineadas a la derecha.
  - **Lote C (sistemas transversales)**: convenciones de íconos por contexto (dashboard vs detalle), unificación de sticky headers/footers en modales, revisión de dark mode.

### Fase 4 — Entrega
- Presentar el reporte al usuario.
- Preguntar qué lote implementar primero (no aplicar cambios sin aprobación explícita, ya que este ciclo es de auditoría).
- Al implementar el lote elegido, actualizar changelog (patch o minor según magnitud) siguiendo la convención del proyecto.

## Criterios de aceptación
- 11 capturas desktop + 2 mobile generadas sin errores de consola bloqueantes.
- Reporte con al menos un hallazgo por ruta o confirmación explícita de que la ruta cumple el estándar.
- Roadmap priorizado con estimación cualitativa (S/M/L) por lote.
- Ningún cambio de código en esta fase; solo lectura, capturas y documento.

## Notas técnicas
- Reutilizar el patrón de auditoría previa (`v6.114.0` Fase 1) para consistencia de formato.
- Baseline actual: v7.180.1 con guardrails G1-G5 en verde, 1231 tests pasando.
- Si alguna ruta requiere data específica, documentar el gap en el reporte sin sembrar datos.
