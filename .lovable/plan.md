# Validación de fix-17 y fix-18

Revisé los 9 hallazgos contra el código y la base de datos real. 3 ya están resueltos o son inocuos; 6 son bugs reales que vale la pena corregir.

## Ya resueltos / descartar (no se toca nada)

- **N-17 (dispatchers leen toda la bitácora)**: la policy "Dispatchers read audit_logs" ya no existe en la base (se eliminó en una migración posterior). Hoy solo los administradores leen `audit_logs`.
- **N-26 (bloquear campos financieros en contratos firmados)**: el trigger actual `enforce_signed_contract_lock` ya rechaza cambios en tarifas, depósito, hora extra, horas máximas y vigencia para contratos `signed`, `active`, `completed` y `cancelled`. El trigger propuesto duplicaría la validación.
- **N-22 (depreciación 48 meses)**: la condición propuesta es lógicamente equivalente a la actual porque los meses del reporte están alineados al inicio de mes. No cambia ninguna cifra.

## Correcciones a aplicar

### 1. N-18 — Revertir desde la bitácora pisa cambios posteriores
`revert_audit_log` restaura los valores viejos a ciegas. Si alguien editó el registro después, ese cambio se pierde sin aviso.
Se agrega una verificación previa: el estado actual debe coincidir con lo registrado en el log (por `updated_at` cuando existe, o comparando los campos del log). Si no coincide, se rechaza con un mensaje que explica que hay cambios posteriores.

### 2. N-31 — Invitar al portal a un cliente archivado
`invite-customer` no filtra clientes archivados y, al archivar, la cuenta del portal queda ligada y el registro archivado sigue visible para ese usuario.
- La función de invitación ignora clientes archivados y responde con un mensaje claro.
- Trigger que desvincula la cuenta del portal al archivar el cliente.
- La regla de acceso "el cliente ve su propio registro" deja de exponer archivados.

### 3. N-34 — Fecha de pago anterior a la emisión de la factura
La base ya lo rechaza, pero el formulario no avisa y el usuario ve el error crudo. Se propaga la fecha de emisión hasta el diálogo de registrar pago y se valida antes de enviar, con mensaje en español.

### 4. N-36 — Extensión de renta bloqueada por mantenimientos irrelevantes
`extend_booking` considera órdenes de mantenimiento archivadas o apenas agendadas/canceladas al calcular el margen de 3 días, así que rechaza extensiones válidas. Se alinea con `create_booking`: solo cuentan órdenes vigentes con trabajo real.

### 5. N-40 — Horómetro que puede ir hacia atrás
Hoy solo el frontend impide capturar una lectura menor a la última. Se agrega la misma regla en la base (trigger) para que ninguna vía (importación, portal, API) pueda registrar un horómetro menor al de la última entrega completada de esa unidad.

### 6. N-45 — Usuario desactivado conserva acceso hasta que caduca su sesión
`has_role` solo revisa el rol; un usuario desactivado sigue operando mientras su token siga vivo.
Se agrega `is_active_user` y `has_role` pasa a exigir perfil activo. Es un cambio de alcance amplio (todas las policies lo heredan), así que:
- Usuarios sin fila en `profiles` no se bloquean (se asume activo).
- Se corre la suite completa de pruebas SQL de RLS y los 1916 tests antes de cerrar.

## Detalles técnicos

- Una sola migración con: `revert_audit_log` endurecida, trigger `trg_customer_archive_unlink_user`, recreación de la policy de clientes (usando `(select auth.uid())` por las reglas del proyecto), `extend_booking` con filtros de mantenimiento, trigger de monotonía de horómetro en `deliveries`, y `is_active_user` + `has_role`.
- Todas las funciones nuevas con `SECURITY DEFINER` + `SET search_path = public`, `REVOKE` de `anon` y `GRANT EXECUTE` explícito.
- Edge functions: `invite-customer` (filtro de archivados) e `invite-user` (limpieza del usuario auth si falla el rol o el perfil, patrón ya usado en `invite-customer`).
- Frontend: `useRecordPaymentForm`, `RecordPaymentDialog`, `InvoiceDetailDialogs`, `InvoiceDetailBody` para propagar `issued_at`.
- Pruebas: nueva suite `supabase/tests/r_fix17_18_smoke.sql` y tests unitarios de la validación de fecha de pago.
- Changelog `7.349.0` (public/changelog.json, CHANGELOG.md, detalle de versión) y bump de `version.json`.
