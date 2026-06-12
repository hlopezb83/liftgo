# Fix: E2E `invoice-payment` falla porque el seed crea facturas con status inválido

## Diagnóstico

- El test `tests/e2e/invoice-payment.spec.ts` espera el botón **"Registrar Pago"** en `/invoices/:id`.
- En `InvoiceDetailActions.tsx` el botón sólo aparece si `invoice.status ∈ {sent, overdue, partial}`.
- El RPC `e2e_seed_scenario` (migración `20260610171252_…sql`, línea 149) inserta la factura con `status = 'issued'`, valor que la UI no contempla → el botón nunca se renderiza → timeout.

Otros tests del shard verde no tocan el botón, por eso solo falla este.

## Cambios

1. **Migración nueva** `supabase/migrations/<timestamp>_fix_e2e_seed_invoice_status.sql`:
   - `CREATE OR REPLACE FUNCTION public.e2e_seed_scenario(...)` reemplazando únicamente el literal `'issued'` por `'sent'` en el `INSERT INTO public.invoices`. Se preserva el resto del cuerpo, grants, y `SECURITY DEFINER`/`search_path`.
   - Sin cambios de schema, sin GRANTs nuevos (la función ya existe y conserva permisos).

2. **Changelog** `public/changelog/v6.44.5.json` + entrada al inicio de `public/changelog.json`:
   - Tipo: `patch`, categoría `testing`/`tooling`.
   - Título: "Fix: seed E2E genera factura en status válido para botón Registrar Pago".

## Verificación

- Re-ejecutar `bunx playwright test tests/e2e/invoice-payment.spec.ts` (manual / siguiente run de CI).
- Confirmar que `supabase/linter` y `tsc` siguen verdes (no se tocan tipos generados).

## Fuera de alcance

- No se modifica `InvoiceDetailActions` ni la lógica de estados de factura.
- No se tocan otros seeds ni otros tests del shard.
