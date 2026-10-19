-- Executed SELECT-only observations. No DDL/DML/application RPC; outputs are counts or cron names/active flags.

-- capabilities
SELECT current_timestamp AS observed_at, current_setting('server_version_num') AS server_version_num, to_regprocedure('pg_catalog.pg_input_is_valid(text,text)') IS NOT NULL AS has_input_validation, to_regclass('cron.job') IS NOT NULL AS has_cron_jobs;

-- quotes_shapes_identities_and_size
WITH qs AS (
 SELECT id, organization_id, line_items FROM public.quotes
), lines AS (
 SELECT q.id AS quote_id, li.value AS line
 FROM qs q CROSS JOIN LATERAL jsonb_array_elements(
 CASE WHEN jsonb_typeof(q.line_items)='array' THEN q.line_items ELSE '[]'::jsonb END) li(value)
), parsed AS (
 SELECT quote_id, line, nullif(line->>'quote_line_id','') AS raw_id,
 CASE WHEN pg_input_is_valid(nullif(line->>'quote_line_id',''),'uuid')
 THEN nullif(line->>'quote_line_id','')::uuid END AS normalized_id FROM lines
), dupes AS (
 SELECT quote_id, normalized_id, count(*) AS occurrences FROM parsed
 WHERE normalized_id IS NOT NULL GROUP BY quote_id, normalized_id HAVING count(*)>1
)
SELECT current_timestamp AS observed_at,
 (SELECT count(*) FROM qs) AS quote_rows,
 (SELECT count(DISTINCT organization_id) FROM qs) AS organizations_with_quotes,
 (SELECT count(*) FROM qs WHERE jsonb_typeof(line_items) IS DISTINCT FROM 'array') AS quote_rows_nonarray_or_null,
 (SELECT coalesce(sum(pg_column_size(line_items)),0) FROM qs) AS stored_line_items_bytes,
 count(*) AS quote_line_elements,
 count(*) FILTER (WHERE jsonb_typeof(line) IS DISTINCT FROM 'object') AS nonobject_line_elements,
 count(DISTINCT quote_id) FILTER (WHERE jsonb_typeof(line) IS DISTINCT FROM 'object') AS quotes_with_nonobject_lines,
 count(*) FILTER (WHERE raw_id IS NULL) AS lines_needing_generated_id,
 count(*) FILTER (WHERE raw_id IS NOT NULL AND normalized_id IS NULL) AS invalid_uuid_lines,
 count(DISTINCT quote_id) FILTER (WHERE raw_id IS NOT NULL AND normalized_id IS NULL) AS quotes_with_invalid_uuid,
 count(*) FILTER (WHERE normalized_id IS NOT NULL AND raw_id IS DISTINCT FROM normalized_id::text) AS valid_noncanonical_uuid_lines,
 (SELECT count(*) FROM dupes) AS duplicate_normalized_id_groups,
 (SELECT count(DISTINCT quote_id) FROM dupes) AS quotes_with_duplicate_normalized_ids
FROM parsed;

-- quote_versions
SELECT current_timestamp AS observed_at, count(*) AS quote_rows, count(*) FILTER (WHERE version IS NULL) AS quote_rows_null_version, count(*) FILTER (WHERE version = 2147483647) AS quote_rows_at_integer_maximum, min(version) AS minimum_version, max(version) AS maximum_version FROM public.quotes;

-- legacy_invoice_shapes_and_provenance
WITH i AS (
 SELECT id,line_items FROM public.invoices
), lines AS (
 SELECT i.id,l.value AS line,
   nullif(l.value->>'source_quote_id','') AS quote_raw,
   nullif(l.value->>'source_quote_line_id','') AS line_raw,
   l.value->>'quantity' AS qty_raw,
   l.value->>'unit_price' AS price_raw,
   l.value->>'discount' AS discount_raw,
   l.value->>'total' AS total_raw,
   l.value->>'amount' AS amount_raw
 FROM i CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(i.line_items)='array' THEN i.line_items ELSE '[]'::jsonb END
 ) l
), parsed AS (
 SELECT *,
   CASE WHEN quote_raw IS NOT NULL AND pg_input_is_valid(quote_raw,'uuid') THEN quote_raw::uuid END AS quote_uuid,
   CASE WHEN line_raw IS NOT NULL AND pg_input_is_valid(line_raw,'uuid') THEN line_raw::uuid END AS line_uuid,
   CASE WHEN qty_raw IS NOT NULL AND pg_input_is_valid(qty_raw,'numeric') THEN qty_raw::numeric END AS qty
 FROM lines
)
SELECT
 current_timestamp AS observed_at,
 count(*) AS invoice_line_elements,
 count(*) FILTER (WHERE line ? 'source_quote_line_id' OR line ? 'source_quote_id') AS lines_with_any_source_key,
 (SELECT count(*) FROM i) AS invoice_rows,
 (SELECT count(*) FROM i WHERE jsonb_typeof(line_items) IS DISTINCT FROM 'array') AS invoices_invalid_outer_shape,
 count(*) FILTER (WHERE jsonb_typeof(line) IS DISTINCT FROM 'object') AS non_object_invoice_lines,
 count(*) FILTER (WHERE (line ? 'source_quote_id') IS DISTINCT FROM (line ? 'source_quote_line_id')) AS mismatched_source_key_presence_lines,
 count(*) FILTER (WHERE line->>'line_kind'='charge' AND NOT (line ? 'source_quote_line_id')) AS charge_lines_without_source_key,
 count(DISTINCT id) FILTER (WHERE line->>'line_kind'='charge' AND NOT (line ? 'source_quote_line_id')) AS invoices_with_charge_without_source_key,
 count(*) FILTER (WHERE quote_raw IS NOT NULL AND NOT pg_input_is_valid(quote_raw,'uuid')) AS invalid_source_quote_uuid_lines,
 count(*) FILTER (WHERE line ? 'source_quote_line_id' AND (quote_uuid IS NULL OR line_uuid IS NULL)) AS sourced_lines_missing_or_invalid_uuid,
 count(*) FILTER (WHERE line ? 'source_quote_line_id' AND
   (quote_raw IS DISTINCT FROM quote_uuid::text OR line_raw IS DISTINCT FROM line_uuid::text)) AS sourced_lines_noncanonical_uuid,
 count(*) FILTER (WHERE line ? 'source_quote_line_id' AND
   (qty_raw IS NULL OR NOT pg_input_is_valid(qty_raw,'numeric') OR qty<=0 OR qty::text IN ('NaN','Infinity','-Infinity'))) AS sourced_lines_invalid_quantity,
 count(*) FILTER (WHERE line ? 'source_quote_line_id' AND (
   (price_raw IS NOT NULL AND NOT pg_input_is_valid(price_raw,'numeric')) OR
   (discount_raw IS NOT NULL AND NOT pg_input_is_valid(discount_raw,'numeric')) OR
   (total_raw IS NOT NULL AND NOT pg_input_is_valid(total_raw,'numeric')) OR
   (line ? 'amount' AND amount_raw IS NOT NULL AND NOT pg_input_is_valid(amount_raw,'numeric'))
 )) AS sourced_lines_invalid_numeric_cast
FROM parsed;


-- quote_numeric_and_identity_validation
WITH q AS (
  SELECT id, line_items, version FROM public.quotes
), lines AS (
  SELECT q.id, l.value AS line,
    nullif(l.value->>'quote_line_id','') AS raw_id,
    l.value->>'quantity' AS raw_quantity,
    l.value->>'unit_price' AS raw_price
  FROM q CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(q.line_items)='array' THEN q.line_items ELSE '[]'::jsonb END
  ) l
), parsed AS (
  SELECT *,
    CASE WHEN raw_id IS NOT NULL AND pg_input_is_valid(raw_id,'uuid') THEN raw_id::uuid END AS parsed_id,
    CASE WHEN raw_quantity IS NOT NULL AND pg_input_is_valid(raw_quantity,'numeric') THEN raw_quantity::numeric END AS qty,
    CASE WHEN raw_price IS NOT NULL AND pg_input_is_valid(raw_price,'numeric') THEN raw_price::numeric END AS price
  FROM lines
), duplicates AS (
  SELECT id,parsed_id FROM parsed WHERE parsed_id IS NOT NULL
  GROUP BY id,parsed_id HAVING count(*)>1
)
SELECT
 current_timestamp AS observed_at,
 (SELECT count(*) FROM q) AS quote_rows,
 (SELECT count(*) FROM q WHERE jsonb_typeof(line_items) IS DISTINCT FROM 'array') AS quotes_invalid_outer_shape,
 (SELECT count(*) FROM q WHERE version=2147483647) AS quote_version_increment_overflow,
 count(*) AS quote_lines,
 count(*) FILTER (WHERE jsonb_typeof(line) IS DISTINCT FROM 'object') AS non_object_lines,
 count(*) FILTER (WHERE raw_id IS NULL) AS lines_needing_generated_id,
 count(*) FILTER (WHERE raw_id IS NOT NULL AND NOT pg_input_is_valid(raw_id,'uuid')) AS invalid_uuid_lines,
 count(*) FILTER (WHERE parsed_id IS NOT NULL AND raw_id IS DISTINCT FROM parsed_id::text) AS valid_but_noncanonical_uuid_lines,
 (SELECT count(*) FROM duplicates) AS duplicate_parsed_uuid_groups,
 (SELECT count(DISTINCT id) FROM duplicates) AS quotes_with_duplicate_parsed_uuids,
 count(*) FILTER (WHERE raw_quantity IS NOT NULL AND NOT pg_input_is_valid(raw_quantity,'numeric')) AS invalid_quantity_cast_lines,
 count(*) FILTER (WHERE raw_price IS NOT NULL AND NOT pg_input_is_valid(raw_price,'numeric')) AS invalid_price_cast_lines,
 count(*) FILTER (WHERE qty<=0) AS nonpositive_quantity_lines,
 count(*) FILTER (WHERE price<0) AS negative_price_lines,
 count(*) FILTER (WHERE qty::text IN ('NaN','Infinity','-Infinity')) AS nonfinite_quantity_lines,
 count(*) FILTER (WHERE price::text IN ('NaN','Infinity','-Infinity')) AS nonfinite_price_lines
FROM parsed;


-- cron_job_metadata
SELECT jobname, active FROM cron.job ORDER BY jobname;

-- legacy_review_projection_exact_source_classifier
WITH invoices_projected_legacy AS (
 SELECT i.id, i.organization_id, i.quote_id, i.booking_id, i.line_items,
 CASE WHEN i.cfdi_status='stamping' THEN true
      WHEN i.cfdi_status='stamped' OR i.cfdi_uuid IS NOT NULL
        THEN i.cancellation_status IS DISTINCT FROM 'accepted'
      ELSE i.status IS DISTINCT FROM 'cancelled' AND i.cfdi_status IS DISTINCT FROM 'cancelled' END AS active,
 CASE WHEN jsonb_typeof(i.line_items)='array' THEN jsonb_array_length(i.line_items)=0 AND coalesce(i.subtotal,0)>0
      ELSE true END AS malformed_or_positive_empty
 FROM public.invoices i
), needs_review AS (
 SELECT i.* FROM invoices_projected_legacy i
 WHERE active AND (malformed_or_positive_empty OR EXISTS (
   SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.line_items)='array' THEN i.line_items ELSE '[]'::jsonb END) li
   WHERE NOT (CASE WHEN nullif(li->>'line_kind','') IS NOT NULL THEN li->>'line_kind' IN ('rental','sale')
    ELSE coalesce(li->>'description' ~ '^.+ — Renta (mensual|semanal|diaria)( \(.*\))?$', false)
    OR coalesce(li->>'description' ~ '^(.+ — )?Extensión: Renta (mensual|semanal|diaria)( \(.*\))?$', false)
    OR coalesce(li->>'description' ~ '^.+ — Renta (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) [0-9]{4} \([0-9]+ días al precio diario\)$', false)
    OR coalesce(li->>'description' ~ '^.+ - Venta de equipo$', false) END)
   AND (li->>'source_quote_id' IS NULL OR li->>'source_quote_line_id' IS NULL)
 ))
), affected AS (
 SELECT q.id AS quote_id,i.id AS invoice_id FROM public.quotes q JOIN needs_review i ON i.organization_id=q.organization_id
 WHERE i.quote_id=q.id OR EXISTS (
  SELECT 1 FROM public.bookings b WHERE b.quote_id=q.id AND b.organization_id=q.organization_id
   AND (b.id=i.booking_id OR EXISTS (
    SELECT 1 FROM public.invoice_bookings ib WHERE ib.invoice_id=i.id AND ib.booking_id=b.id AND ib.organization_id=q.organization_id
   ))
 )
)
SELECT current_timestamp AS observed_at,
 (SELECT count(*) FROM needs_review) AS active_invoices_with_legacy_review_candidate_lines,
 count(DISTINCT invoice_id) AS such_invoices_linked_to_quotes,
 count(DISTINCT quote_id) AS quotes_projected_to_require_legacy_review,
 count(*) AS affected_quote_invoice_pairs
FROM affected;
