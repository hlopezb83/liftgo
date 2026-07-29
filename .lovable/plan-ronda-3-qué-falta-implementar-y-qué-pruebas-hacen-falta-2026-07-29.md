# Ronda 3 — Qué falta implementar y qué pruebas hacen falta

## Estado actual (verificado contra la base de datos y el código)

De los 27 hallazgos del documento, **solo 1 está aplicado**: DB3-08 (cancelación de cotizaciones aceptadas, v7.261.0, migración `20260729202535`). No tiene pruebas propias todavía.

Comprobaciones hechas:
- `guard_invoice_cancellation` en la base no menciona `service_role` → DB3-01 pendiente.
- `guard_invoice_fiscal_metadata` ya exime a `service_role`, pero falta la cobertura de INSERT/sustitución → DB3-02 pendiente (parcial).
- No existe la marca de sesión `app.inspection_rpc` ni el flag `app.cxp_rpc` → DB3-03 y DB3-05 pendientes.
- No existen las funciones guard de contratos, prospectos, daños, borrado de bookings/deliveries ni la inmutabilidad de `user_roles.user_id` → DB3-09, DB3-11, DB3-14, DB3-15, DB3-16 pendientes.
- `PortalInvoicePayment.tsx` no maneja `isError` → FE3-01 pendiente.
- Al facturar un daño no se escribe `damage_records.invoice_id` → FE3-02 pendiente.
- `LIST_FETCH_LIMIT`/`visibleListRows` ya existen y están en uso, pero faltan las 4 páginas que cita FE3-06.

## Plan por fases

### Fase 1 — Base de datos P0 (DB3-01 a DB3-05)
Cinco migraciones en orden: cancelación SAT vía `service_role`; endurecer metadatos fiscales en INSERT y sustitución; procedencia de inspecciones (`app.inspection_rpc` + REVOKE de INSERT directo); validar que reserva y montacargas coinciden en `complete_return_inspection`; aprobación de CxP solo por RPC con flag `app.cxp_rpc` y REVOKE columnar.

### Fase 2 — Base de datos P1 (DB3-06, 07, 09, 10, 13)
Cerrar el bypass de cotización vencida `draft → accepted`; ampliar el lock de cotización aceptada a `customer_name`, `forklift_id`, `quote_type`, `rental_meta`; dominio y congelado de estados de contratos; `guard_is_e2e_flag` también en INSERT para las 7 tablas; endurecer `app.payment_sync` con `pg_trigger_depth() > 1` (coordinado con DB3-01).

### Fase 3 — Base de datos P2 (DB3-11, 12, 14, 15, 16, 17)
`user_roles.user_id` inmutable; redondeo de pagos a 2 decimales; daños con restauración coherente del montacargas y cargo validado; guard de borrado en bookings y deliveries; prospectos ganados con `final_amount > 0`; misceláneos de facturas de proveedor, líneas vacías, notas de crédito y entregas históricas.

En todas las fases se conserva el bypass `app.e2e_teardown` + `is_e2e` para que el teardown automatizado siga funcionando.

### Fase 4 — Frontend (FE3-01 a FE3-10)
Estado de error en el pago del portal (riesgo de pago duplicado); escribir `invoice_id` al facturar un daño; corregir falsos vacíos y esqueletos eternos en 8 pestañas de Configuración; conciliación de facturas (falso cero, exportar en error, rango invertido); permisos por rol; patrón limit+1 en 4 páginas; áreas táctiles de autenticación en móvil; truncado en tarjetas móviles; reglas de negocio en Ventas; ajustes de Despachador/Admin.

## Pruebas

Hoy hay 215 archivos de pruebas unitarias y 25 specs E2E, pero **ninguna cubre la ronda 3** (ni siquiera DB3-08 ya aplicado). Se añadirán junto con cada fase:

- **Unitarias (Vitest):** guardas y reglas puras — redondeo de pagos, dominio de estados de contratos y prospectos, validación de cargo por daño, helpers de conciliación, estado de error del pago en el portal, `visibleListRows` en las páginas nuevas.
- **Integración con la base:** un script SQL de humo por fase, siguiendo el checklist del documento (transiciones inválidas, guards que deben lanzar error, redondeos, restauración de estado del montacargas).
- **E2E (Playwright):** cancelación de cotización aceptada (DB3-08), flujo de pago del portal con error de red, y una pasada de seed + teardown E2E después de cada fase de base de datos para confirmar que el bypass sigue vivo.

## Detalles técnicos

- Migraciones nuevas con timestamps incrementales a partir de `20260730081000`, cada una idempotente (`CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS`).
- Mensajes de error en español sin acentos, siguiendo el estilo del repositorio.
- DB3-13 depende de DB3-01: aplicar en ese orden.
- Al cierre de cada fase: subir versión en `package.json`, `public/version.json` y agregar entrada al changelog (índice + detalle).

## Orden sugerido

Fase 1 (crítica, desbloquea la cancelación fiscal) → Fase 4 FE3-01/FE3-02 (riesgo de dinero) → Fase 2 → resto de Fase 4 → Fase 3.
