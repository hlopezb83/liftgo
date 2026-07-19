## Auditoría de Sprint 2 (v7.100.0)

- `trg_audit_logs_immutable` correcto (bypass vía `app.audit_maintenance='on'`).
- Política `Admins read` sólo SELECT; `revert_audit_log` reinserta `action='REVERT'` con `source_audit_log_id`.
- `auditImmutability.test.ts` cubre trazabilidad, guard admin y bypass de mantenimiento (6 casos).
- Suite completa: 1073 tests en verde. Sin regresiones detectadas.

Todo verde → continúo con Sprint 3.

---

## Sprint 3 — v7.101.0

Cubre 3 hallazgos abiertos de Ronda 3.

### BL-35 / BL-36 — Parser CFDI: Receptor y TipoDeComprobante

Hoy `parseCfdi` (`supabase/functions/parse-cfdi-expense/cfdi-parser.ts`) sólo lee `Emisor` y atributos del `Comprobante`, ignorando:
- `cfdi:Receptor` (Rfc, Nombre, UsoCFDI, DomicilioFiscalReceptor, RegimenFiscalReceptor).
- `Comprobante.TipoDeComprobante` (I/E/N/P/T).

Sin esto no podemos validar que el CFDI esté emitido a nuestro RFC ni distinguir Ingreso/Egreso/Pago al registrar la factura de proveedor.

Cambios:
1. Extender `ParsedCfdi` con:
   - `tipo_comprobante: "I" | "E" | "N" | "P" | "T"`
   - `receptor: { rfc, nombre, uso_cfdi, domicilio_fiscal, regimen_fiscal }`
2. `parseCfdi` extrae ambos bloques con los helpers existentes (`findTag` / `attr`).
3. Migración: agregar a `public.supplier_bills` las columnas
   - `receptor_rfc text`
   - `tipo_comprobante text CHECK (tipo_comprobante IN ('I','E','N','P','T'))`
4. `supabase/functions/parse-cfdi-expense/index.ts`:
   - Persistir `receptor_rfc` y `tipo_comprobante`.
   - Validar que `receptor.rfc` coincide con `company_settings.rfc`; si no, responder 400 `CFDI_RECEPTOR_MISMATCH`.
   - Rechazar `tipo_comprobante = 'I'` sólo se acepta como gasto (E se permite como nota de crédito futura; N/P/T se rechazan con mensaje explícito).
5. Extender `cfdi-parser_test.ts` con fixtures para receptor y para cada `TipoDeComprobante`.

### BL-37 — Bloqueo del último admin en `delete-user`

`supabase/functions/delete-user/index.ts` sólo evita que un admin se borre a sí mismo. Si borra a otro admin y era el último, el sistema queda sin admin.

Cambios:
1. Antes del borrado, consultar `user_roles` con `role='admin'`:
   - Si `user_id` objetivo tiene rol admin y `count(admins) <= 1`, responder 400 `LAST_ADMIN_CANNOT_BE_DELETED`.
2. Añadir caso en `delete-user/index_test.ts` que mockea Supabase y verifica la respuesta.

### Entregables

- Migración `add_receptor_and_tipo_to_supplier_bills.sql`.
- `cfdi-parser.ts` extendido + `index.ts` con validaciones.
- `delete-user/index.ts` con guard de último admin.
- Tests nuevos: casos parser (receptor, tipo comprobante, mismatch), test último admin.
- `public/changelog.json` + `public/changelog/v7.101.0.json` (minor: nuevas validaciones sin cambios rompedores).

### Verificación

- `cd supabase/functions && deno test --allow-all`
- `bunx vitest run`
- `deno fmt --check`

### Fuera de alcance

- Ronda 3 BL-40..BL-45 (idempotencia de webhooks, colas de reintento) — se aborda en Sprint 4.
