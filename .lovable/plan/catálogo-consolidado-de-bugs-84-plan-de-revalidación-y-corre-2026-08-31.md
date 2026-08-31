# Catálogo consolidado de bugs (84) — plan de revalidación y corrección

El documento subido combina la 1ª pasada (35 hallazgos, ya trabajados y cerrados en v7.389.x) con una 2ª pasada nueva de 49 hallazgos, todos levantados contra el commit `5ad5761` / v7.374.4. Hoy el proyecto está en v7.389.1, así que parte de los hallazgos puede ya estar cerrado o haber cambiado de forma.

## Fase 0 — Revalidación contra HEAD (sin cambios de código)

Revalidar los 49 hallazgos de la 2ª pasada contra el código actual y clasificar cada uno como: cerrado, vigente, parcialmente vigente u obsoleto. Se entrega una tabla corta en el chat (sin crear archivos MD nuevos). Los 35 de la 1ª pasada solo se verifican por muestreo, ya que se cerraron en v7.389.x.

## Fase 1 — Críticos y altos vigentes

Corregir en lotes pequeños, con pruebas por cada corrección:

- Recurrentes y CFDI: moneda de la reserva en facturación recurrente, IVA línea por línea, datos fiscales genéricos por default en el timbrado, uso CFDI inválido para régimen 616, REP parciales que no descuentan notas de crédito.
- Reportes: mantenimientos y daños archivados sumados en utilidad por modelo, estado de resultados, ROI por unidad y rentabilidad por cliente; gastos e ingresos en divisa sin conversión.
- Cotizaciones y ventas: cotización "Público en General" bloqueada para conversión, venta de unidad en `maintenance`/`rented` sin entrega, tipo de cambio nunca capturado en cotizaciones USD.
- Operación: archivar OT en progreso deja la unidad atascada en `maintenance`.
- CxP: umbral de aprobación evaluado solo al insertar.
- Conciliación bancaria: importación de montos "1.500" interpretados como $1.50.
- Facturación manual desde reserva USD que no hereda moneda.

## Fase 2 — Medios vigentes

Portal (saldos sin conversión de divisa, moneda en desgloses, PDF de estado de cuenta), CxP (facturas rechazadas contadas como deuda, separación de funciones en aprobación), mantenimiento (kanban que reabre OT completada sin guard), fleet/bookings (reserva sobre unidad archivada, sync de estatus, devoluciones), daños facturados con factura cancelada, contratos (PDF de contrato firmado y depósito en garantía), datos fiscales sin validar contra catálogo SAT, y restauración de registros archivados.

## Fase 3 — Bajos

Correcciones de bajo riesgo: paginación sin tiebreaker, escape de búsqueda, encoding Latin-1 en importaciones, fechas imposibles en parseo bancario, combustible obligatorio en inspección, buffer de mantenimiento hardcodeado, filtros `is_e2e` faltantes, límite de tamaño de PDF CSF y captura de screenshot en feedback.

## Notas técnicas

- Se preservan todas las reglas de negocio, RLS, guards de RPC, máquinas de estado, lógica fiscal y permisos existentes; los cambios de backend solo endurecen o corrigen lo que el hallazgo señala.
- Toda migración SQL nueva cumple las reglas permanentes: RLS habilitado, policies explícitas sin `USING (true)`, GRANTs, `(select auth.uid())`, `SET search_path = public` y `scripts/lint-migrations.ts`.
- Cada lote se valida con pruebas focalizadas, typecheck y lint; los fallos preexistentes se reportan por separado.
- Se actualizan `CHANGELOG.md`, `public/changelog.json` y `public/version.json` por lote (minor para fases 1 y 2, patch para fase 3).
- Se usan subagentes en paralelo para revalidación y para lotes independientes.
- No se crean archivos MD de auditoría nuevos.
