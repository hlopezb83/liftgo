# Ronda 4 de auditoría — plan de implementación

El documento trae 8 hallazgos de base de datos (DB4-01 a DB4-08) y 6 de frontend (FE4-01 a FE4-06), con diffs propuestos. Antes de aplicar nada, cada diff se valida contra el código real (en rondas anteriores algunos diffs venían desalineados con el estado actual del repo).

## Fase 0 — Validación (subagentes en paralelo)

Verificar contra el repo y la base de datos:
- Que cada función/trigger que el documento re-emite exista con el cuerpo que asume (`set_supplier_bill_approval_status`, `guard_damage_record_invoice`, `audit_trigger_fn`, `damage_restore_forklift_status`, `guard_quote_valid_until`, `guard_contract_signable`, `recalc_supplier_bill`, `create_booking`).
- Que las re-emisiones conserven los bypass de E2E (`app.e2e_teardown`, `is_e2e`) — este fue el riesgo que rompió la suite en la ronda 3.
- Que los archivos de frontend citados existan en las líneas indicadas.

Se reporta cualquier diff inválido antes de tocar código.

## Fase 1 — Base de datos P0/P1 (DB4-01 a DB4-06)

1. **DB4-01** — Impedir que una factura de proveedor nazca ya aprobada (cierre de la "puerta INSERT").
2. **DB4-02** — Guard de factura al insertar daños y estado inicial forzado a `reported`.
3. **DB4-03** — Auditar INSERT/UPDATE de filas marcadas como prueba para que dejen rastro.
4. **DB4-04** — Al cancelar o borrar una reserva, liberar el montacargas.
5. **DB4-05** — La restauración de estado tras un daño respeta mantenimientos abiertos.
6. **DB4-06** — REVOKE columnar de las 5 columnas fiscales de `invoices`.

Cada punto es una migración idempotente propia, en el orden que fija el documento.

## Fase 2 — Edge function + bajos de DB (DB4-07, DB4-08 a–d)

- **DB4-07** — `toggle-user-status`: actualizar el perfil primero y el bloqueo después, con compensación si falla.
- **DB4-08a** — Corregir el mensaje del lock de `valid_until` (la ruta real es `sent → expired → draft`).
- **DB4-08b** — Exigir unidad asignada al firmar un contrato.
- **DB4-08c** — `supplier_bills.balance` pasa a ser calculado, no editable directo.
- **DB4-08d** — INSERT directo de reservas restringido a admin (coherente con `create_booking`).

## Fase 3 — Frontend P0/medios (FE4-01 a FE4-03)

- **FE4-01** — 8 páginas de detalle distinguen "no existe" de "falló la red" usando `QueryErrorState` (incluye `PortalQuoteDetail`, visible para clientes).
- **FE4-02** — Los 4 tabs de operaciones muestran error y carga también en móvil (hoy la rama móvil se come el `isError`).
- **FE4-03** — Botón "Cancelar cotización" para cotizaciones aceptadas, respetando rol y ausencia de reservas confirmadas.

## Fase 4 — Frontend bajos (FE4-04 a FE4-06)

- **FE4-04** — Tap targets de 44px en pantallas públicas de acceso.
- **FE4-05** — `isError` en Antigüedad de saldos, Conciliación bancaria, MRR, Cuentas bancarias/Historial de importaciones y el panel de factura de proveedor; aviso de truncamiento donde hay `limit(100)`.
- **FE4-06** — Tooltip de rol en "Ganado", limpieza del estado muerto `declined`, ocultar "Eliminar" en entregas según estado/rol, botón "Archivar" en daños solo cuando la DB lo permite, y balance CxP de solo lectura (coordinado con DB4-08c).

## Fase 5 — Pruebas y cierre

- Pruebas unitarias para la lógica nueva (reglas de cancelación de cotización, reglas de visibilidad de botones, cálculo de balance CxP).
- Script SQL de humo `r4_smoke.sql` que ejercita cada guard nuevo.
- Correr Vitest completo y typecheck.
- Actualizar `package.json`, `version.json`, `public/changelog.json` y el detalle `public/changelog/v{X.Y.Z}.json`.

## Notas técnicas

- Migraciones idempotentes (`CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`), timestamps `202607310000xx`, errores en español sin acentos, `ERRCODE = 'check_violation'`.
- Toda re-emisión de función preserva el bypass E2E existente; si un diff del documento lo omite, se corrige antes de aplicarlo.
- El frontend reutiliza `QueryErrorState` y los helpers ya existentes; nada de lógica de negocio nueva en las vistas.
