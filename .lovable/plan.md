# Remediación auditoría liftgo v2

Verifiqué en el código y en la base de datos los hallazgos decisivos del reporte antes de planear. Confirmados: el crítico de invitación de clientes, los 4 medios y la policy pendiente de la v1.

## Lo que confirmé

- **Invitación de clientes rota (crítico).** El trigger `on_auth_user_created` está activo y `handle_new_user()` ya inserta el perfil y el rol `customer`. La función `invite-customer` vuelve a insertar ambos con `INSERT` plano, y existen `UNIQUE (user_id, role)`, `user_roles_one_role_per_user` y `profiles_user_id_key`. Al chocar, el nuevo manejo de errores llama `cleanupInvitedUser()` y borra la cuenta recién creada, devolviendo 500. Es decir: hoy toda invitación de cliente falla.
- **Resumen financiero de contrato.** `useContractFinancialSummary` trae la factura completa por la pivote y la suma entera; una factura que cubre dos reservas se cuenta completa en ambos contratos.
- **Fecha editable con REP timbrado.** `DatePickerField` pasa `disabled` solo al calendario; el `MaskedDateInput` no lo recibe, así que la fecha sigue editable por teclado.
- **Captura parcial de fecha.** Con menos de 8 dígitos, `commit` no notifica al formulario ni muestra error: se guarda en silencio la fecha anterior.
- **Query pivote sin límite.** `useAllInvoiceBookings` hace `select` sin `.limit()`; al pasar el tope de PostgREST reaparece la doble facturación.
- **Policy pendiente (A2).** Sigue existiendo "Dispatchers full access quote_assigned_forklifts" con `FOR ALL`.

## Fase 1 — Bloqueante (crítico)

Reparar `invite-customer`:
- Eliminar el borrado del rol `dispatcher` y los `INSERT` planos de `user_roles` y `profiles`.
- Reflejar lo que ya hace `invite-user`: `upsert` del rol con `onConflict` y `update` del perfil, tolerando que el trigger ya los haya creado.
- Mantener el `cleanupInvitedUser()` solo para fallos posteriores reales (ligar `customers.user_id`).
- Agregar prueba del flujo (rol y perfil ya existentes ⇒ éxito, sin borrar la cuenta).

## Fase 2 — Medios

1. Atribuir por partida la facturación multi-reserva en el resumen de contrato (la pivote tiene `line_index`) y actualizar `combineInvoiceSummaries.test.ts`, que hoy consagra el comportamiento actual.
2. Cablear `disabled`/matcher al `MaskedDateInput` (bloqueo real de teclado cuando el matcher deshabilita todo, p. ej. REP timbrado y pagos a proveedor con fechas futuras).
3. Capturas parciales de fecha: mostrar error visible y notificar `undefined` al formulario en lugar de conservar la fecha anterior.
4. `.limit(LIST_FETCH_LIMIT)` + aviso de truncamiento en la query pivote, e invalidarla al cancelar un CFDI (N-B2).

## Fase 3 — Backlog (bajos y residuales v1)

- Residuales v1: A2 (policy `FOR ALL` de dispatcher sobre `quote_assigned_forklifts`), A8 (fechas date-only en bitácora), A9 (paginación en 3 tablas), A10 (hash de dedup bancario), A11 (daños vs disponibilidad), A12 (cards móviles sin teclado).
- N-B1 a N-B14 (validar TC antes de reservar parcialidad, trigger de mecánico para "marcar reparado", edición de máscara a mitad de segmento, rango invertido, dedup de toasts, etc.).

## Detalles técnicos

- Los cambios de la fase 1 y 2 son de aplicación y edge function; la migración de A2 (fase 3) seguirá las reglas permanentes: `(select auth.uid())`, sin `FOR ALL ... USING (true)`, con GRANT y prueba RLS.
- Verificación por fase: `tsgo --noEmit`, lint, `bunx vitest run`, y suites SQL cuando toque migración.
- Changelog: una entrada por fase (fase 1 = patch de corrección crítica, fase 2 = minor).

## Alcance propuesto ahora

Fases 1 y 2. La fase 3 se agenda como sprint aparte salvo que prefieras incluirla.
