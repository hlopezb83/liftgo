# Ronda 4 — Qué quedó pendiente y qué falta de pruebas

Todo el código de la Ronda 4 (DB4-01 a DB4-08, DB4-07 y FE4-01 a FE4-06) ya está aplicado y la suite pasa en verde (1380 pruebas). Lo que falta es **cobertura de pruebas** de lo nuevo y una **corrida E2E** que confirme que los candados nuevos no rompen los datos sembrados.

## 1. Pendientes reales (no es código de producto)

| Pendiente | Estado hoy |
|---|---|
| Smoke SQL de los guards de la ronda 4 | No existe `supabase/tests/r4_smoke.sql` (sí existe el de la ronda 3) |
| Suite E2E (Playwright) tras los candados nuevos | No se ha corrido; el guard de "reserva solo por flujo autorizado" toca las semillas |
| Pruebas de los cambios de frontend de esta ronda | Ver tabla siguiente |
| Prueba de la edge function `toggle-user-status` | No hay ninguna prueba de edge functions en el repo |

## 2. Qué quedó sin pruebas, hallazgo por hallazgo

| Hallazgo | ¿Tiene prueba? |
|---|---|
| DB4-01 factura de proveedor no nace aprobada | No |
| DB4-02 daño nace "reportado" + unidad válida | No |
| DB4-03 auditoría de banderas de prueba forzadas | No |
| DB4-04 la unidad se libera al cancelar/borrar reserva | No |
| DB4-05 al reparar, la unidad vuelve a mantenimiento si hay órdenes abiertas | No |
| DB4-06 columnas fiscales restringidas | No |
| DB4-07 orden perfil→acceso con compensación | No |
| DB4-08 saldo CxP no editable / reserva directa solo admin | No |
| FE4-01 error de red en 8 páginas de detalle | Solo `PortalInvoices` tiene prueba |
| FE4-02 pestañas móviles muestran el error | No |
| FE4-03 cancelar cotización aceptada | El archivo existe pero solo cubre aceptar/rechazar |
| FE4-04 objetivos táctiles de 44px | No (bajo valor, se puede omitir) |
| FE4-05 pantallas financieras con error de red | No |
| FE4-06 archivar daño / ocultar eliminar en entregas | Parcial: el tooltip de CRM sí, lo demás no |

## 3. Plan propuesto para cerrar la brecha

**Fase A — Smoke SQL de base de datos (mayor impacto)**
Crear `supabase/tests/r4_smoke.sql` siguiendo el formato de `r3_smoke.sql`: un caso por guard (8 bloques) que intenta la operación prohibida y verifica que el error esperado se dispare, más los casos felices (reparar un daño con orden abierta, cancelar una reserva y ver la unidad liberada).

**Fase B — Pruebas de frontend**
- `QuoteDetailActions`: caso de cancelar cotización aceptada, visibilidad por rol y manejo del error del guard.
- `useDamageRecords`: caso de archivar.
- `DeliveryActions`: "Eliminar" oculto según estado y rol.
- Un test compartido y parametrizado que monte cada pestaña de catálogo en móvil con la consulta en error y verifique que se ve el estado de error en lugar de la lista vacía.
- Dos o tres páginas de detalle representativas (reserva, contrato, proveedor) con la consulta en error.

**Fase C — Verificación E2E**
Correr la suite de Playwright para confirmar que las semillas siguen funcionando con el candado de reservas y con el estado inicial forzado de daños. Si falla, ajustar las funciones de semilla (no los candados).

## 4. Detalles técnicos

- El smoke SQL corre con rol de servicio, así que cada bloque debe simular el rol real con `set_config('request.jwt.claims', ...)` igual que `r3_smoke.sql`, y respetar las banderas de bypass existentes (`app.e2e_teardown` + `is_e2e`, `app.booking_rpc`, `app.cxp_recalc`).
- Las pruebas de error de red se montan con `QueryClient` en modo sin reintentos y el hook mockeado devolviendo `isError: true`; se asserta la presencia de `QueryErrorState` y del botón de reintentar.
- No se toca `package.json` salvo el bump de versión final y su entrada de changelog.

## 5. Fuera de alcance

- Pruebas de objetivos táctiles (FE4-04): se validan mejor con revisión visual que con aserciones de clases CSS.
- Infraestructura de pruebas para edge functions: hoy no existe y montarla es un sprint propio; se puede cubrir el orden de operaciones con una prueba de integración manual documentada.
