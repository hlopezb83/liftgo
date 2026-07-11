## Estado actual

Los 3 lotes anteriores cubrieron los hallazgos más visibles (colisiones en sidebar, `MoneyIcon` sobrecargado en pagos/costos, `Send` genérico para entregas y firmas). Pero la auditoría **no fue exhaustiva por archivo**: se enfocó en ~10 pantallas de alto tráfico. Aún quedan **248 archivos** consumiendo el registry y **11 archivos** con `MoneyIcon` sin revisar caso por caso.

## Qué falta auditar

Un barrido final por dominio, revisando cada uso restante y decidiendo si el alias actual es el más específico posible.

**Zonas prioritarias (aún sin peinar):**

1. **Reportes / dashboards financieros** — `FinancialKpiCards`, `IncomeStatementReport`, `MrrDetailPage`, `RentalFinancialSummary`, `ForkliftRatesCard`. Distinguir: ingresos (MoneyIcon OK), utilidad (TrendingUpIcon), margen (TargetIcon), MRR (ActivityIcon o TrendingUpIcon), tarifa (PaymentIcon vs MoneyIcon).
2. **Portal cliente** — `PortalDashboard`, `SupplierDetailPage`. Confirmar que balances/saldos usan el ícono correcto (ExpenseIcon para deuda, PaymentIcon para pagos, MoneyIcon para totales facturados).
3. **Mantenimiento** — `MaintenanceDetailSheet` y componentes vecinos. Verificar refacciones vs. inventario, técnico asignado (UserIcon vs. otro), costos.
4. **Botones de acción secundarios** en detail pages menos visitadas (fleet, damage, logistics, accounts-payable, quotes drafts).
5. **Estados/badges** — buscar usos de `AlertTriangle`/`Info`/`Clock` que podrían tener alias más específicos (ej. `OverdueIcon` para vencidos, nuevo `PendingIcon` si aplica).
6. **Iconos que aún no tienen alias** — `Filter`, `SlidersHorizontal`, `MoreHorizontal`, `ExternalLink`, `Link`, `Mail`, `Image`, `Camera`, `Paperclip`, etc. Decidir cuáles merecen entrada semántica.

## Enfoque propuesto

**Lote A — Auditoría dirigida (read-only, con subagente)**
- Subagente peina los 248 archivos y produce un reporte tabular: `archivo | ícono actual | contexto (label/tooltip) | recomendación | severidad`.
- Filtrar el reporte a hallazgos accionables (drift claro, no preferencia estética).

**Lote B — Ampliación del registry**
- Agregar aliases nuevos justificados por el reporte (candidatos: `FilterIcon`, `MoreIcon`, `ExternalLinkIcon`, `MailIcon`, `AttachmentIcon`, `PhotoIcon`, y posiblemente `RevenueIcon`/`ProfitIcon`/`MarginIcon` si el dominio financiero lo pide).
- Actualizar JSDoc y test del registry.

**Lote C — Migración**
- Aplicar cambios sugeridos por el reporte en batches por dominio (financiero, mantenimiento, portal, catálogos).
- Extender ESLint guard con los nuevos nombres crudos.

**Lote D — Verificación y changelog**
- `tsgo`, `bunx eslint .`, `bunx vitest run`.
- Changelog `v7.11.1` (patch — refinamiento sobre 7.11.0).

## Estimación de esfuerzo

- Lote A: análisis, sin cambios. Salida es un reporte para tu revisión.
- Lote B-D: dependiendo del reporte, típicamente 15–40 archivos tocados.

## Alternativa más ligera

Si prefieres cerrar el tema en vez de un barrido completo: parar aquí, marcar la auditoría como "cubrió zonas de alto tráfico" y abrir refinamientos puntuales solo cuando aparezcan (regla: cualquier ícono nuevo pasa por el registry, el ESLint guard ya lo fuerza).

## Detalles técnicos

- El reporte de Lote A se genera con `rg` + inspección por subagente, agrupando por directorio de feature.
- El registry ya expone 66 aliases; los nuevos irán en la sección correspondiente del JSDoc (Dominio LiftGo / Genéricos / Estados).
- No se tocan tests existentes salvo `registry.test.ts` para incluir aliases nuevos.
