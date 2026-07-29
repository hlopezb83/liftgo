# Ronda 3 — qué falta y qué pruebas hacen falta

## Estado actual (verificado contra la base de datos y el código)

Aplicado ya: DB3-01 a DB3-05 (P0), DB3-06, DB3-07, DB3-08, DB3-09, FE3-01 y FE3-02.

Pendiente: 8 hallazgos de base de datos y 8 de frontend.

### Base de datos pendiente
| Ítem | Qué falta | Verificación |
|---|---|---|
| DB3-10 | El guard de banderas e2e sólo corre en UPDATE (`BEFORE UPDATE OF is_e2e, e2e_scope`); falta cubrir INSERT en las 7 tablas y auditar siempre el flip | trigger inspeccionado en `invoices` |
| DB3-11 | No existe trigger que impida reasignar `user_id` en `user_roles` | sin `guard_user_roles_immutable_user_id` |
| DB3-12 | No hay redondeo a 2 decimales en `payments` / `supplier_payments` | sin `round_payment_amount` |
| DB3-13 | `app.payment_sync` no exige `pg_trigger_depth() > 1` (bypass de máquina de estados de facturas) | cuerpo actual de `validate_transition` |
| DB3-14 | Daños: sin dominio de status, sin restauración coherente del montacargas ni validación de cargo | triggers de `damage_records` |
| DB3-15 | Sin guard de DELETE en `bookings` ni en `deliveries` | triggers de esas tablas |
| DB3-16 | Prospects: falta exigir `final_amount > 0` al ganar y estado inicial | triggers de `prospects` |
| DB3-17 | Misceláneos bajos (supplier_bills, line_items, notas de crédito, entregas históricas, sync de flota) | no aplicados |

### Frontend pendiente
- FE3-03: 8 pestañas de Configuración/Operaciones con esqueleto eterno y falso vacío (no hay `QueryErrorState` en esos módulos).
- FE3-04: conciliación bancaria — falso cero, exportar en error, rango de fechas invertido.
- FE3-05: matriz de permisos — falso "Sin acceso" y edición sin datos.
- FE3-06: patrón limit+1 con `LIST_FETCH_LIMIT` faltante en Auditoría y 3 páginas más.
- FE3-07: áreas de toque en autenticación móvil.
- FE3-08: truncado en tarjetas móviles con textos largos.
- FE3-09: gate de "Ganado" en Ventas, copy de cotización aceptada y alta de CxP (el cambio de `declined` a `rejected` ya quedó hecho; falta limpiar las referencias restantes en `src/test/constants.test.ts` y `src/lib/rules/__tests__/quotes.test.ts`).
- FE3-10: retirar "Completar" de reservas, estado inicial de flota, protección de último admin y hint de 404.

## Sobre las pruebas

Hoy sólo existe una prueba nueva de la Ronda 3: `QuoteDetailActions.test.tsx` (aceptar/rechazar). Todo lo demás (DB3-01 a DB3-09, FE3-01, FE3-02) quedó **sin pruebas propias**. La suite general (1366 unitarias) sigue verde, pero no cubre estas reglas.

Cobertura propuesta, por tipo:
- **Reglas puras (Vitest):** dominio de estados de cotizaciones y contratos, gate de "Ganado" en prospectos, redondeo de importes, helpers de limit+1.
- **Componentes (Vitest + Testing Library):** estados de error/vacío de las pestañas de FE3-03, conciliación (FE3-04), permisos (FE3-05), portal de pago (FE3-01).
- **Script SQL de humo:** un archivo `supabase/tests/r3_smoke.sql` (ejecutable manualmente) que intente las operaciones prohibidas y verifique que cada guard responde: aceptar borrador, aceptar vencida, editar cotización aceptada, firmar contrato sin cliente, mover `user_id` de rol, insertar pago con 3 decimales, borrar reserva, insertar fila con `is_e2e` sin ser actor e2e.
- **E2E (Playwright):** flujo de pago del portal y verificación de que el teardown con `app.e2e_teardown` sigue funcionando. Sólo corre en CI; en este entorno no hay binario de Chromium ni credenciales de prueba.

## Orden sugerido

1. **Fase 3 — base de datos P2:** DB3-10, DB3-11, DB3-12, DB3-13 (los cuatro son cierres de bypass; DB3-13 toca `validate_transition`, así que se re-emite conservando `accepted → cancelled` de DB3-08).
2. **Fase 3b:** DB3-14, DB3-15, DB3-16, DB3-17 (reglas de negocio de daños, borrados, prospectos y misceláneos).
3. **Fase 4 — frontend:** FE3-03 a FE3-06 (correcciones de datos y estados de error), luego FE3-07 a FE3-10 (UX móvil y de negocio).
4. **Fase 5 — pruebas:** unitarias por regla, script SQL de humo y specs E2E, más la limpieza de `declined` en las pruebas existentes.

## Detalles técnicos

- Cada bloque de base de datos se aplica como migración independiente usando el SQL del documento, adaptado a lo que ya está en producción: `validate_transition` debe conservar la transición `accepted → cancelled` y el dominio de contratos debe conservar `sent` (lo usa la interfaz), como ya se hizo en la fase anterior.
- Los guards de DB3-10 y DB3-15 deben preservar la exención de limpieza E2E (`app.e2e_teardown` + `is_e2e` + `e2e_scope`) para no romper el teardown automatizado.
- Cada versión cierra con entrada nueva en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json` y sincronización de `package.json` y `public/version.json`.
