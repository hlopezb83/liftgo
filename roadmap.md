# Roadmap — 10 hallazgos confirmados (YAGNI)

## Hallazgos
- [x] 1. Seguros del panel: `get_insurance_alerts` excluye E2E (migración + smoke SQL).
- [x] 2. Facturas: solo paginación por páginas; se quitó "Mostrando…"/"Cargar más"; páginas restantes se cargan en segundo plano.
- [x] 3. Auth: toast de error con id estable; se descarta al reintentar y al establecerse sesión válida.
- [x] 4. Títulos KPI: wrap de hasta 2 líneas en `KpiTile` (title accesible conservado).
- [x] 5. Entregas vacías: no reproducible en HEAD (32 registros visibles; join tolerante ya existente). Verificado en navegador.
- [x] 6. Entregas atrasadas: badge "Atrasada" con fecha local Monterrey; orden ascendente ya coloca atrasadas primero.
- [x] 7. Contratos duplicados: pre-verificación + candado en DB (históricos CTR-0002/CTR-0003 intactos) + mensaje "Ya existe un contrato para esta reserva".
  - [x] Corrección v7.421.2: el índice con corte por fecha no bloqueaba contratos nuevos frente a duplicados históricos; se reemplazó por trigger transaccional (`trg_contract_one_active_per_booking`) con candado advisory por reserva, 23505 reconocible por la UI y smoke SQL propio (`r_fix40_contratos_duplicado_trigger_smoke.sql`).
- [x] 8. Bitácora: "Sistema" único + traducciones de campos técnicos + fallback legible.
- [x] 9. Devoluciones: `inspected_by` automático con usuario autenticado; solo admin edita; helper con pruebas.
- [x] 10. Estado de resultados: "Egresos antes de depreciación" + tarjeta "Depreciación total" (sin cambiar cálculos).

## Validación
- [x] Pruebas unitarias relacionadas (contratos, bitácora, devoluciones, facturas): 44 pruebas en verde.
- [x] Typecheck/build sin errores; lint limpio en archivos cambiados.
- [x] Navegador: panel (Seguros 52, títulos KPI completos), Facturas (solo paginación por páginas, 1–25 de 118, pestañas/filtros activos), Entregas (32 resultados, badges "Atrasada", atrasadas primero), Bitácora (sin "Sistema Sistema" ni campos técnicos), Estado de resultados (5 tarjetas).
- [x] Auth verificado en navegador: el error se descarta al reintentar y el segundo fallo sí muestra su error (se corrigió reuso de id de toast que lo ocultaba).
- [x] Validador de changelog en verde (se repararon 9 entradas previas: categorías y archivos de detalle faltantes).

## Cierre
- [x] Changelog v7.421.1 (CHANGELOG.md + JSON + version.json).
