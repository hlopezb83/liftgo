# Cerrar los hallazgos que sigan abiertos de la auditoría QA (35 hallazgos)

El documento subido es la misma auditoría de 35 hallazgos hecha sobre v7.374.4 (commit `5ad5761`). Desde entonces el proyecto avanzó a v7.388.0 con correcciones en varias fases. Este trabajo no vuelve a tocar lo ya corregido: primero se revalida cada hallazgo contra HEAD y sólo se corrige lo que siga vivo.

## Fase 0 — Revalidación (sin cambios de código)

Cuatro subagentes en paralelo, uno por bloque de módulos (fiscal/CFDI, finanzas/CxP/conciliación, cotizaciones/reservas/flotilla, reportes/dashboard/UI). Cada hallazgo se marca como:

- cerrado (con el commit/versión que lo cerró),
- abierto (con la evidencia actual en HEAD),
- obsoleto (el código citado ya no existe o cambió de semántica).

Salida: una tabla de estado en el chat. No se crean archivos MD nuevos.

## Fase 1 — Corregir lo que siga abierto

Se corrige por orden de severidad reportada, hallazgo por hallazgo, con el mismo método usado en las fases anteriores:

1. Reproducir con una prueba que falle.
2. Corregir con el cambio mínimo, respetando las reglas de negocio, RLS, máquinas de estado y lógica fiscal existentes.
3. Volver a correr la prueba y las suites del módulo afectado.

Los candidatos conocidos que quedaron pendientes al cierre de v7.388.0 (se confirman en la Fase 0 antes de tocarlos):

- **A5-09 — deduplicación de líneas bancarias.** Hoy el índice único `(bank_account_id, hash)` obliga a incluir `lineSeq` en el hash, así que dos movimientos idénticos legítimos del mismo día se distinguen sólo por su posición en el archivo. Requiere rediseñar la clave de deduplicación (incluir fecha/monto/referencia y tratar el reimport del mismo archivo aparte), con migración.
- **A3-07** y validaciones residuales de reservas/devoluciones.
- **Propagación de tipo de cambio cotización → reserva** (la cotización ya captura el TC; falta verificar que la reserva y la factura lo hereden en todos los caminos).
- Cualquier otro hallazgo que la Fase 0 marque como abierto.

## Fase 2 — Cierre

- Ajustes de zona horaria del runner si la falla de `supplierBillDueDate` sigue presente.
- Entrada de changelog y bump de versión (minor si hay cambio de regla de negocio, patch si son correcciones aisladas), en `CHANGELOG.md`, `public/changelog.json`, `public/changelog/vX.Y.Z.json` y `public/version.json`.
- Corrida final: typecheck, lint, suites afectadas y build, separando las fallas preexistentes no relacionadas (hoy: `arch:check` con imports cross-feature y el error de entorno de ESLint).

## Detalles técnicos

- Los cambios de base de datos van sólo por migración, con RLS, GRANT, `(select auth.uid())` en policies y `SET search_path = public` en funciones SECURITY DEFINER.
- Los bloqueos de negocio nuevos se exponen con los primitivos existentes `BusinessBlock` / `BlockedActionNotice`, sin copys ad-hoc.
- Los cambios de RPC/trigger llevan smoke SQL con rollback en `supabase/tests/`, siguiendo el patrón `r_fixNN_*.sql`.
- Los hallazgos que dependen de Facturapi en vivo se validan con pruebas del cuerpo enviado; el timbrado real queda como verificación manual del negocio.

## Entrega

Reporte al final: hallazgos cerrados en esta ronda, hallazgos ya cerrados antes, obsoletos, archivos tocados, versión y resultados de pruebas.
