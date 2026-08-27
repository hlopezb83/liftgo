# fix-28: cinco correcciones de base de datos (R5-03, R5-04, R5-05, R5-10, R5-11)

Validé los cinco hallazgos contra las funciones que corren hoy en la base. Los cinco son reales.

## Qué está mal hoy (verificado)

- **R5-03 · KPIs financieros con datos de prueba**: `get_financial_kpis` no filtra registros E2E ni unidades archivadas. El MRR (actual y del mes previo), el DSO y los totales de vencidos incluyen rentas, unidades y facturas de prueba.
- **R5-04 · Facturas atoradas en "parcial"**: el guard de transiciones sólo permite `partial -> overdue` y `partial -> cancelled`. Falta `partial -> paid`, así que una factura con abonos que se liquida fuera del flujo automático de pagos no puede marcarse pagada.
- **R5-05 · Bypass de auditoría que se queda encendido**: `revert_audit_log` enciende `app.audit_revert` antes de sus validaciones y sólo lo apaga si todo sale bien. Si una validación falla con error, el bypass queda activo el resto de la transacción y desactiva los guards de estado para las operaciones siguientes del mismo request.
- **R5-10 · Notas de crédito sin convertir en el flujo de efectivo**: el dashboard suma `credit_notes.total` en crudo (una NC en USD se cuenta como si fueran pesos) y sólo exige `status = 'stamped'`, ignorando NCs canceladas ante el SAT y NCs de facturas de prueba.
- **R5-11 · Ingreso por unidad sin convertir**: el ingreso de utilización del dashboard suma `invoices.total` sin aplicar moneda ni tipo de cambio, inflando/desinflando las unidades facturadas en dólares.

## Qué se va a hacer

Todo el cambio es de base de datos; no hay cambios de interfaz.

1. Recrear `get_financial_kpis` agregando los filtros `is_e2e IS NOT TRUE` (rentas, unidades, facturas) y `deleted_at IS NULL` en unidades, en MRR, MRR previo, DSO, DSO previo y los agregados de vencidos.
2. Recrear `validate_transition` agregando `paid` a las transiciones válidas desde `partial` en facturas. No se agrega `sent`: retroceder una factura con abonos falsearía la antigüedad de cartera. Todo lo demás (bypasses de recálculo de CxP, sync de pagos, flujo SAT, RPC de flotilla y el guard de unidad entregada sin devolución) se conserva sin cambios.
3. Recrear `revert_audit_log` envolviendo el bloque restaurador en `BEGIN ... EXCEPTION WHEN OTHERS` que apaga `app.audit_revert` y relanza el error, de modo que el bypass nunca sobreviva a una salida por error.
4. Recrear `get_dashboard_stats` una sola vez con los dos arreglos del dashboard juntos (R5-10 y R5-11 tocan la misma función):
   - notas de crédito convertidas a pesos con la moneda de la NC y el tipo de cambio de su factura, criterio canónico de NC vigente (`cfdi_status = 'stamped'`, no cancelada, cancelación no aceptada) y exclusión de NCs de facturas de prueba;
   - ingreso de utilización convertido a pesos con `moneda`/`tipo_cambio` de la factura.

## Detalles técnicos

- Cuatro migraciones (`CREATE OR REPLACE FUNCTION`), sin tablas ni policies nuevas; se conservan `SECURITY DEFINER`, `SET search_path TO 'public'` y los guards de rol existentes en cada función, conforme a las reglas permanentes de migraciones.
- El diff trae R5-10 y R5-11 como dos migraciones acumulativas de `get_dashboard_stats`; se aplica sólo la acumulativa final para no reescribir la función dos veces.
- Verificación: `supabase--linter`, ejecución de `get_financial_kpis` y `get_dashboard_stats` comparando cifras antes/después, más la suite Vitest y el build.
- Changelog: nueva entrada `v7.358.0` en `public/changelog.json`, `public/changelog/v7.358.0.json` y `CHANGELOG.md`, y bump de versión en `package.json`.
