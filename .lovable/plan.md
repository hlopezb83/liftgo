# Preflight 0099 (solo lectura, 3-oct-2026 ~10:43 UTC)

Sin cambios. Datos verificados en la base real del proyecto:

- HEAD del proyecto: adf9ce04378f3b5724c81581491939714caa5e99 (no incluye el PR #225)
- Ledger Drizzle (últimas 3, hash = primeros 12 caracteres):
  - id 101 · when 1790991931103 · 57cd6e7be403
  - id 100 · when 1790991273930 · 377913168d9c
  - id 99 · when 1790991167291 · 88a1c3176b7c
- public.platform_fiscal_jobs: existe; columna config_source: NO existe
- Triggers BEFORE UPDATE en public.cfdi_retry_queue:
  - cfdi_retry_queue_set_updated_at: BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  - trg_organization_write_context: BEFORE INSERT OR UPDATE FOR EACH ROW EXECUTE FUNCTION enforce_organization_write_context()
- Cola cfdi_retry_queue: 0 filas en total (ningún estado ni operación); no hay trabajos processing
- Facturas en stamping: 0; en stamping sin ID de Facturapi: 0
- public.platform_fiscal_actions: NO existe
- RPC platform_begin_fiscal_action y platform_complete_fiscal_action: NO existen

Límites: el rol de lectura del sandbox no tiene permiso sobre el esquema drizzle; el ledger se leyó con la herramienta de consulta del backend. Los ids del ledger son internos y no equivalen al número de archivo 00xx.
