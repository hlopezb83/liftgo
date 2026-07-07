
# Folio de Facturapi como fuente de verdad para REP (CP-<folio>)

Aplicar a los Recibos Electrónicos de Pago (REP / complementos de pago) el mismo principio: **el folio de Facturapi es la fuente de verdad**. Como los REP no tienen concepto de borrador (sólo existen al momento de timbrar), no hay placeholder `BORRADOR-` que promover; el cambio es: al timbrar, guardar `CP-<folio>` en la fila del pago y mostrarlo en la UI.

## 1. Migración de base de datos

Nueva migración `<timestamp>_rep_folio.sql`:

- `ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS rep_number text;`
- `ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS rep_folio text;`
- Índice único parcial para evitar colisiones cuando ya haya folio:
  `CREATE UNIQUE INDEX IF NOT EXISTS payments_rep_number_uidx ON public.payments (rep_number) WHERE rep_number IS NOT NULL;`
- RPC `assign_stamped_rep_number(p_payment_id uuid, p_folio text) RETURNS text` (SECURITY DEFINER, `SET search_path=public`):
  - Valida folio no nulo.
  - `v_new := 'CP-' || lpad(p_folio, 4, '0')`.
  - Verifica colisiones en `payments.rep_number` (excluyendo p_payment_id).
  - `UPDATE public.payments SET rep_number = v_new, rep_folio = p_folio WHERE id = p_payment_id`.
  - Devuelve `v_new`.
- `GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text) TO service_role;`
- Sin backfill: los REP históricos quedan con `rep_number = NULL`; la UI mostrará el UUID cuando no exista el folio.

## 2. Edge function `supabase/functions/stamp-payment-complement/index.ts`

Tras el timbrado exitoso:

- Extender el tipo de `repInvoice` para incluir `folio_number?: number | string | null`.
- Después del `UPDATE payments SET rep_cfdi_status='stamped'…`, si `repInvoice.folio_number` no es nulo:
  ```ts
  const folio = String(repInvoice.folio_number);
  const { data, error } = await supabase.rpc("assign_stamped_rep_number", {
    p_payment_id: payment_id,
    p_folio: folio,
  });
  ```
  Loggear pero no abortar si falla (el REP ya está timbrado).
- Devolver `rep_number` en la respuesta JSON de éxito.

## 3. Frontend

- **`src/integrations/supabase/types.ts`** se regenerará automáticamente tras la migración; nada manual.
- **`RepBadge.tsx`**: cuando `payment.rep_number` esté disponible, mostrar `CP-XXXX` como etiqueta principal (mantener el UUID accesible como tooltip o subtítulo).
- **`InvoicePaymentSummary.tsx`**: donde se lista el REP de cada pago, mostrar `rep_number` (con fallback al UUID abreviado si no existe, para pagos históricos).
- **Cualquier PDF/descarga de REP** que use nombre de archivo puede opcionalmente usar `rep_number` como sufijo — sólo revisar `downloadRep`/`downloadPayment` si existen y ya reciben un label; sin renombrar rutas de storage (siguen indexadas por UUID).

## 4. Documentación y memoria

- Nueva entrada `public/changelog/v6.113.0.json` + índice `public/changelog.json` (minor).
- Actualizar `mem://logic/document-numbering`: mencionar que los REP también se numeran `CP-<folio Facturapi>` al timbrar.

## Consideraciones

- No hay migración de datos: los REP existentes conservan `rep_number = NULL` hasta que, si se re-timbraran, tomarían folio nuevo. La UI muestra fallback.
- Se mantiene la ruta de storage por UUID; no la tocamos para no invalidar enlaces históricos.
- El índice único es parcial (`WHERE rep_number IS NOT NULL`), permitiendo múltiples pagos históricos sin folio.
