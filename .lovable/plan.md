# Estado real de la guía de pendientes + plan de los 4 bloques elegidos

## A. Ya corregido (verificado hoy contra la base y el código)

- **B5-02 · PDF estado de cuenta:** el saldo ya resta las notas de crédito (`total_invoiced − total_paid − total_credited`).
- **Residual (a) · defaults 616/06600:** en notas de crédito y complementos de pago solo se usan para el receptor genérico `XAXX010101000`; un cliente con RFC real ya no timbra con datos de relleno.
- **Residual (b) · uso de CFDI G03:** `create_recurring_invoice` ya no aplica G03 a ciegas; falla con mensaje si falta el uso del cliente.
- **Residual (c) · llave de agrupación recurrente:** la llave ya incluye moneda y tipo de cambio, así que no se mezclan MXN y USD en una factura.
- **A3B-03 · inspección de devolución:** la función de base de datos ya rechaza fechas futuras (se eliminó la ventana de 30 días).
- **A4-05 (mitad servidor):** las tres funciones de timbrado ya validan el dígito verificador del RFC antes de gastar timbre.
- **A6R2-7 · buffer de mantenimiento:** ya es configurable en la configuración de la empresa (0 a 30 días) y lo leen reservas, extensiones y disponibilidad.
- **A2-3 · lote CxP abandonado:** ya existe la función de cancelación de lote y el hook que la invoca.

## B. Falsos positivos: NO se deben "corregir"

- **Paso 0 (migración 054419 rota):** la guía asume que bloquea el despliegue. En la base real `get_income_statement` **existe** y su definición ya contiene manejo de tipo de cambio y exclusión de borradores. Rehacer el Paso 0 tal cual reescribiría la función vigente con una versión anterior: **no ejecutarlo**. El único remanente sano de esa recomendación es no volver a parchear funciones con reemplazo de texto.
- **A1-3:** la propia guía lo marca cerrado.
- **v_mrr_prev:** esa vista **no existe** en la base; el trabajo de MRR va sobre `get_mrr_detail` y los KPIs, no sobre una vista inexistente.

## C. Pendientes reales confirmados

| Ítem | Estado verificado |
|---|---|
| 2A-1 / 2A-2 (ER) | La función ya menciona tipo de cambio y borradores; falta auditar CTE por CTE que gastos en divisa conviertan y que las facturas rechazadas se excluyan, más el contador visible en la UI |
| A2-7 (MRR) | `get_mrr_detail` conserva el fallback 1:1 |
| A6R2-2 (rechazo CxP) | `reject_supplier_bill` sigue escribiendo `approved_by`; no existen columnas `rejected_by/rejected_at` |
| A3B-05 (re-conversión) | `convert_quote_to_bookings` no filtra reservas canceladas |
| A4-05 (captura) | `rfcOptional` (clientes/proveedores) sigue sin dígito verificador |
| A5-05 (bloqueo optimista) | Formularios de cotización y reserva no envían versión |
| A1-6 (prefill cotizaciones) | Dedup por modelo colapsa partidas; no respeta el tipo de tarifa |
| A3B-07, A4B-05, A6R2-3, B5-01, A2-9, A4B-08, A5-07 | Sin cambios: quedan fuera de esta tanda |

---

# Plan: 4 bloques aprobados

## Bloque 1 — Estado de resultados con FX correcto (2A-1 / 2A-2)

- Reescritura completa (no parche de texto) de `get_income_statement` conservando su firma actual.
- Gastos (facturas de proveedor y gastos operativos): convertir a pesos con el tipo de cambio del documento, usando el mismo criterio canónico que ya usan facturas y flujo de efectivo.
- Excluir facturas de proveedor en borrador, canceladas y rechazadas de todos los bloques de gasto.
- Documentos en divisa sin tipo de cambio: se excluyen y se cuentan en `fx_missing_count`, en lugar de sumarse como si fueran pesos.
- UI del reporte: aviso "N documentos excluidos por falta de tipo de cambio" cuando el contador sea mayor a cero.

## Bloque 2 — MRR sin conversión 1:1 (A2-7)

- Reescribir `get_mrr_detail` (y alinear los KPIs financieros si comparten el fallback) para excluir reservas en divisa sin tipo de cambio y devolver `mrr_fx_missing_count`.
- Mostrar el contador en el bloque de KPIs de MRR con el patrón de aviso existente.

## Bloque 3 — Rechazo de facturas de proveedor (A6R2-2)

- Migración: agregar `rejected_by` y `rejected_at` a facturas de proveedor.
- Reescribir `reject_supplier_bill` para limpiar aprobador/fecha de aprobación y registrar rechazante y fecha de rechazo, conservando bloqueo de fila y permisos actuales.
- Backfill de filas ya rechazadas que tengan aprobador registrado.
- UI: no mostrar al rechazante como aprobador.

## Bloque 4 — Quick wins restantes

- **A3B-05:** agregar el filtro de reservas canceladas en la conversión de cotizaciones y en el guard de borrado, para que una cotización con todas sus reservas canceladas vuelva a ser convertible o borrable.
- **A4-05 (captura):** aplicar el validador de dígito verificador también al RFC opcional de clientes y proveedores, respetando RFCs genéricos válidos.
- **A5-05:** propagar la versión del registro desde el formulario de cotización y desde las acciones de reserva, con mensaje claro cuando otro usuario ya guardó cambios.
- **A1-6:** deduplicar partidas por ocurrencia (no por modelo) y respetar el tipo de tarifa al reconstruir líneas de cotizaciones antiguas.

## Detalles técnicos

- Todas las funciones se reemplazan con `CREATE OR REPLACE` de cuerpo completo; prohibido el parcheo con `pg_get_functiondef` + `replace()`.
- Se mantienen RLS, permisos, `SET search_path = public`, guards de rol y `(select auth.uid())` en policies.
- Pruebas: vitest junto a cada hook/componente tocado y pruebas de las funciones nuevas donde aplique.
- Verificación final: typecheck, ESLint, `arch:check`, suite vitest y linter de base de datos.
- Changelog y `public/version.json` se actualizan al cierre (versión menor por bloque funcional).
