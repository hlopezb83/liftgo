
# Folio diferido para Notas de Crédito

Replicar en las Notas de Crédito el mismo esquema que ya usan las facturas: los borradores llevan un placeholder no fiscal (`BORRADOR-NC-XXXX`) y, al timbrar, se promueven a `NC-<folio>` usando el folio que devuelve Facturapi como fuente de verdad. Esto elimina huecos en la numeración fiscal cuando un borrador se elimina o falla al timbrarse.

## 1. Migración de base de datos

Crear `supabase/migrations/<timestamp>_credit_note_draft_folio.sql`:

- `CREATE SEQUENCE public.draft_credit_note_seq START 1;`
- `next_draft_credit_note_number()` → `'BORRADOR-NC-' || lpad(nextval(...)::text, 4, '0')` (SECURITY DEFINER, `SET search_path=public`).
- `peek_next_draft_credit_note_number()` (STABLE) equivalente al de facturas.
- `assign_stamped_credit_note_number(p_credit_note_id uuid, p_folio text) RETURNS text`:
  - Valida folio no nulo.
  - Calcula `v_new := 'NC-' || lpad(p_folio, 4, '0')`.
  - Verifica que no exista colisión en `public.credit_notes.credit_note_number` con otro id.
  - `UPDATE public.credit_notes SET credit_note_number = v_new WHERE id = p_credit_note_id`.
  - Retorna `v_new`.
- `GRANT EXECUTE` a `authenticated` y `service_role` según patrón existente (assign solo `service_role`).
- Backfill: `UPDATE public.credit_notes SET credit_note_number = 'BORRADOR-NC-' || lpad(nextval('public.draft_credit_note_seq')::text,4,'0') WHERE status = 'draft' AND cfdi_uuid IS NULL AND facturapi_invoice_id IS NULL AND credit_note_number LIKE 'NC-%';`

Se conserva `next_credit_note_number()` para no romper otros llamadores; queda como legado sin uso desde el cliente.

## 2. Frontend

**`src/features/invoices/hooks/creditNotes/useCreditNoteMutations.ts`**
- Cambiar `supabase.rpc("next_credit_note_number")` por `supabase.rpc("next_draft_credit_note_number")` dentro de `useCreateCreditNote`.
- Si `stamp: true`, tomar el `credit_note_number` promovido que devuelva la edge function (nuevo campo en la respuesta) y usarlo para invalidar cachés; el `notifySuccess` puede mostrar el folio final cuando exista.

**Tests `__tests__/useCreditNoteMutations.test.ts`**
- Renombrar el mock RPC a `next_draft_credit_note_number` y ajustar aserciones sobre el número inicial (`BORRADOR-NC-0001`).
- Agregar caso: al timbrar, el número final proviene del payload de la edge function.

Si hay algún selector/preview que muestre el siguiente folio de NC, usar `peek_next_draft_credit_note_number` (buscar y ajustar solo si existe).

## 3. Edge function `supabase/functions/stamp-credit-note/handler.ts`

Después del bloque que actualiza `credit_notes` con `cfdi_status: 'stamped'`:

- Extraer folio de Facturapi igual que `stamp-cfdi`:
  ```ts
  const facturApiFolioRaw = (facturApiInvoice as { folio_number?: number | string | null }).folio_number ?? null;
  const facturApiFolio = facturApiFolioRaw != null ? String(facturApiFolioRaw) : null;
  ```
- Si `ncRow.credit_note_number` empieza con `BORRADOR-NC-` y hay `facturApiFolio`, invocar:
  ```ts
  supabase.rpc("assign_stamped_credit_note_number", {
    p_credit_note_id: credit_note_id,
    p_folio: facturApiFolio,
  })
  ```
  Loggear pero no abortar si falla (la NC ya está timbrada).
- Devolver `credit_note_number` en la respuesta JSON de éxito.

## 4. Documentación y memoria

- Nueva entrada `public/changelog/v6.112.0.json` + índice `public/changelog.json` (minor: cambio de comportamiento en numeración de NC).
- Actualizar `mem://logic/document-numbering` para mencionar que las NC ahora siguen el mismo patrón diferido de folio que las facturas.

## Consideraciones técnicas

- `credit_notes.credit_note_number` es `NOT NULL UNIQUE`; los prefijos `BORRADOR-NC-` y `NC-` no colisionan.
- Se descarta agregar columnas `serie/folio` a `credit_notes` (no existen hoy y no son necesarias: el número final incrusta el folio).
- La numeración legacy queda como está; solo se libera folios de borradores actuales para evitar huecos futuros.
- Sin cambios en cancelación, PDF o descargas: usan `credit_note_number` como etiqueta y siguen funcionando con ambos prefijos.
