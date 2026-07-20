## Auditoría de Ola 5 — resultado

- **ESLint:** 11 → 2 warnings. Los 2 residuales (`react-compiler` en `useLiftgoTable.ts:122` y `useTableFilters.ts:155`) son consecuencia de disables intencionales sobre APIs imperativas de TanStack Table. Costo aceptado, documentado en el changelog v7.116.0.
- **Tests:** 1083/1083 Vitest verdes (159 archivos), 15 Deno verdes.
- **Tamaños:** todos los archivos tocados quedaron entre 47 y 168 LOC. Sin regresiones detectadas.
- **Regresión previa** en `CustomersPage` (disable mal ubicado) corregida.

Todo en verde. Propongo cerrar el sprint técnico de ESLint y retomar el plan de la **auditoría integral** (`liftgo-auditoria-integral.md`), avanzando a Sprint 2.

## Siguiente fase — Sprint 2: Alto impacto operativo

Findings HIGH que quedaron pendientes tras Sprint 1a/1b (fiscal/dinero). Propuesta de olas cortas, cada una con tests y verificación antes de continuar:

### Ola 2.1 — Reservas y disponibilidad

- **BL-A5 (Race en exclusión GiST):** revisar `create_booking` / extensiones y asegurar que la exclusión GiST se evalúe dentro de una transacción con `SET LOCAL lock_timeout` y reintento controlado en el cliente.
- **BL-A6 (Buffer de 3 días de mantenimiento):** validar que el buffer se aplique en `check_forklift_availability` y en extensiones, no solo en creación.
- Tests Vitest para el hook `useCreateBooking` + tests SQL (`supabase/tests`) para el RPC.

### Ola 2.2 — Facturación recurrente

- **BL-A7 (Alineación de ciclos):** verificar que `generate_recurring_invoices` respete meses calendario exactos y `monthly_rate` vigente al momento de la generación (ya documentado en `mem://logic/recurring-billing-pricing`, falta test de regresión).
- **BL-A8 (Propagación de partidas no-renta):** asegurar el copiado idempotente por `quote_id` (ya en `mem://logic/quote-logistics-propagation`, falta test).

### Ola 2.3 — Portal de clientes y roles

- **SEC-R3 (Portal read-only):** auditar RLS de `customer_portal_users` y verificar que ninguna mutación esté expuesta.
- **SEC-R4 (Escalación de roles):** confirmar que `has_role` se usa consistentemente y que ninguna policy referencia `profiles.role` directamente.

### Ola 2.4 — CFDI y pagos

- **BL-A9 (Timbrado idempotente):** garantizar que `stamp-cfdi` no genere doble timbre si se reintenta (idempotency key por `invoice_id + version`).
- **BL-A10 (Complemento de pago):** revisar generación de complementos en pagos parciales multi-factura.

## Detalle técnico

Cada ola sigue el mismo ciclo:

1. Leer el finding en `liftgo-auditoria-integral.md` y el código actual.
2. Escribir test que reproduzca el problema (Vitest o Deno según capa).
3. Implementar fix mínimo.
4. Correr `bunx eslint .`, `bunx vitest run`, `deno test` según aplique.
5. Actualizar `public/changelog.json` + `public/changelog/v{X.Y.Z}.json`.
6. Pausar para auditoría antes de la siguiente ola.

## Pregunta al usuario

¿Confirmas seguir con **Sprint 2 → Ola 2.1 (Reservas y disponibilidad)**, o prefieres priorizar otra ola (recurrente, portal, CFDI) primero?vamos con sprint 2