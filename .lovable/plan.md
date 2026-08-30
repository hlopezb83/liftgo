# Remediación completa de la auditoría QA (35 hallazgos)

Base: auditoría sobre v7.374.4; HEAD actual v7.383.1. Verifiqué en HEAD que A5-01 (sobrecobro de 1 día) y A1-B3 (IVA en notas de crédito) siguen abiertos, y que A4-06 (archivar cliente con saldo) ya quedó resuelto en v7.383.0. El resto se revalida al inicio de cada fase antes de tocar código.

## Regla de trabajo para todas las fases

- Cada fase: revalidar el hallazgo en HEAD → arreglar → prueba de regresión que reproduce el bug → correr suites afectadas + typecheck + lint + build → entrada de changelog y bump de versión.
- Cambios de base de datos sólo por migración, con RLS/GRANT/`(select auth.uid())`/`SET search_path = public` según las reglas permanentes del proyecto.
- Nada de archivos MD nuevos de auditoría/plan.
- Si una fase revela que el hallazgo ya no aplica, se reporta como obsoleto sin cambios.

## Fase 0 — Revalidación (sin cambios de código)

Confirmar en HEAD cuáles de los 35 siguen abiertos y cuáles ya se corrigieron entre v7.374.4 y v7.383.1. Salida: tabla de estado (abierto / ya corregido / obsoleto). Esto evita retrabajo en las fases siguientes.

## Fase 1 — Críticos (3)

1. **A5-01 — Sobrecobro de 1 día.** En `src/lib/domain/rentalCalculation.ts`, cuando `addMonths` clampea el ancla (31-ene → 28-feb), avanzar el inicio del remanente un día en lugar de aplicar la corrección sólo cuando la fecha final es fin de mes. Tests: 31-ene→01-mar, 30-ene→01-mar, 31-mar→01-may, 31-ene→02-mar.
2. **A1-B1 — Línea de prorrateo intimbrable.** Emitir la línea de prorrateo con `quantity: 1` y `unit_price = total`, o repartir centavos. Añadir test de invariante `total === round(unit_price × quantity, 2)` para toda línea generada.
3. **A1-B3 — NC timbra IVA de más.** En `supabase/functions/stamp-credit-note/handler.ts` replicar la lógica de `stamp-cfdi`: respetar `objeto_imp === "01"` y `tax_rate` por línea, y añadir reconciliación de varianza antes de marcar `stamped`.

## Fase 2 — Altos, bloque fiscal y de datos (5)

- **A6-1 (regresión):** archivar OT en progreso deja el montacargas atascado en `maintenance`; restaurar la restitución de estatus perdida en la migración `20260828014156`.
- **A4-04:** `stamp-cfdi` deja de rellenar régimen "616" / CP "06600" por default; si faltan datos fiscales del receptor, bloquear con error explicable en vez de timbrar datos falsos.
- **A1-B2:** IVA de facturas recurrentes agrupadas calculado línea por línea.
- **A5-02:** cotización en USD captura tipo de cambio y la reserva lo hereda (hoy TC=1).
- **A4-05:** validación de RFC con dígito verificador y verificación en servidor antes de timbrar.

## Fase 3 — Altos, bloque financiero y de flujo (5)

- **A2-1 + A2-4 (juntos, según la nota del verificador):** cash flow con pagos en otra moneda, y reemplazo del trigger legado `enforce_payment_balance` para que acepte pagos cross-currency y descuente notas de crédito.
- **A2-3:** lote de pago CxP abandonado/borrado libera las bills bloqueadas.
- **A3-01:** cotización "Público en General" convertible.
- **A3-02:** venta de unidad en `maintenance`/`rented` sin entrega completada.
- **A4-01 y A4-02:** `report_profit_by_model` y `get_income_statement` excluyen mantenimientos y daños archivados.

## Fase 4 — Medios (12)

A2-5, A2-7, A3-03, A3-04, A3-05, A4-03, A5-03, A5-05, A5-06, A6-2, A2-2 residual y el ajuste de zona horaria del runner de tests (`TZ=America/Monterrey` en `vitest.config.ts`, que hoy provoca la única falla del baseline). Se agrupan por módulo: reportes/dashboard, reservas/devoluciones, pagos/conciliación, concurrencia.

A5-05 (last-write-wins) se limita a activar el opt-in de bloqueo optimista ya existente en los formularios de cotización, reserva y factura; no se introduce un modelo nuevo.

## Fase 5 — Bajos (10)

A2-8, A2-9, A3-06, A3-07, A3-08, A5-07, A5-08, A5-09 y los residuales de UI. Correcciones puntuales de validación, dedup y presentación.

## Detalles técnicos

- Los hallazgos con veredicto PLAUSIBLE-NO-PROBABLE (integración Facturapi) se validan contra la definición vigente del handler y con pruebas unitarias del cuerpo enviado; el timbrado real queda como verificación manual del negocio.
- Cambios en RPCs/triggers llevan smoke SQL con rollback en `supabase/tests/`, siguiendo el patrón `r_fixNN_*.sql` ya usado.
- Los bloqueos de negocio nuevos se exponen con los primitives existentes `BusinessBlock` / `BlockedActionNotice`, sin inventar copys ad-hoc.
- Versionado: cada fase cierra con un bump minor (cambios de regla de negocio) o patch (correcciones aisladas) y su entrada en `CHANGELOG.md` + `public/changelog*`.

## Entrega

Fase por fase, con reporte al final de cada una: hallazgos cerrados, archivos tocados, versión y resultados de pruebas, separando fallas preexistentes no relacionadas (hoy: `arch:check` con 2 imports cross-feature).
