# Roadmap — 10 hallazgos confirmados (YAGNI)

## Hallazgos
- [x] 1. Seguros del panel: `get_insurance_alerts` excluye E2E (migración + smoke SQL).
- [x] 2. Facturas: solo paginación por páginas; se quitó "Mostrando…"/"Cargar más"; páginas restantes se cargan en segundo plano.
- [x] 3. Auth: toast de error con id estable; se descarta al reintentar y al establecerse sesión válida.
- [x] 4. Títulos KPI: wrap de hasta 2 líneas en `KpiTile` (title accesible conservado).
- [x] 5. Entregas vacías: no reproducible en HEAD (32 registros visibles; join tolerante ya existente). Verificado en navegador.
- [x] 6. Entregas atrasadas: badge "Atrasada" con fecha local Monterrey; orden ascendente ya coloca atrasadas primero.
- [x] 7. Contratos duplicados: pre-verificación + índice único parcial (históricos CTR-0002/CTR-0003 intactos) + mensaje "Ya existe un contrato para esta reserva".
- [x] 8. Bitácora: "Sistema" único + traducciones de campos técnicos + fallback legible.
- [x] 9. Devoluciones: `inspected_by` automático con usuario autenticado; solo admin edita; helper con pruebas.
- [x] 10. Estado de resultados: "Egresos antes de depreciación" + tarjeta "Depreciación total" (sin cambiar cálculos).

## Validación
- [ ] Pruebas unitarias relacionadas (contratos, bitácora, devoluciones).
- [ ] Typecheck/build sin errores.
- [ ] Revisión en navegador: Entregas (estados loading/error/vacío), filtros de Facturas.

## Cierre
- [x] Changelog v7.421.1 (CHANGELOG.md + JSON + version.json).
