-- Historical charge review is a separate append-only audit trail. This does not
-- edit invoice JSON/CFDI, infer matches from descriptions, or backfill tracking.
-- Writers use READ COMMITTED, invoice first, then quote UUID order. Quote edits
-- never take invoice locks. Existing recurring advisory/booking locks stay intact.
CREATE TABLE public.quote_charge_legacy_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  invoice_line_index integer NOT NULL CHECK (invoice_line_index >= 0),
  invoice_line_snapshot jsonb NOT NULL CHECK (jsonb_typeof(invoice_line_snapshot) = 'object'),
  invoice_line_hash text NOT NULL CHECK (invoice_line_hash ~ '^[a-f0-9]{64}$'),
  -- Preserve the final reservation associations while allowing the established
  -- save RPC to DELETE/INSERT the same set atomically at transaction end.
  invoice_booking_ids uuid[] NOT NULL,
  classification text NOT NULL CHECK (classification IN ('charge','rental','not_quote_charge')),
  quote_line_id uuid,
  quantity numeric,
  actor_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 4000 AND reason ~ '[^[:space:]]'),
  evidence text NOT NULL CHECK (length(btrim(evidence)) BETWEEN 3 AND 10000 AND evidence ~ '[^[:space:]]'),
  request_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, request_key),
  CHECK ((classification = 'charge' AND quote_line_id IS NOT NULL AND quantity IS NOT NULL AND quantity > 0
    AND quantity::text NOT IN ('NaN','Infinity','-Infinity'))
    OR (classification IN ('rental','not_quote_charge') AND quote_line_id IS NULL AND quantity IS NULL))
);
CREATE INDEX quote_charge_legacy_reviews_scope_idx ON public.quote_charge_legacy_reviews
  (organization_id, invoice_id, invoice_line_index, quote_id);
CREATE INDEX quote_charge_legacy_reviews_source_idx ON public.quote_charge_legacy_reviews
  (organization_id, quote_id, quote_line_id) WHERE classification = 'charge';
CREATE TABLE public.quote_charge_legacy_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  review_id uuid NOT NULL UNIQUE REFERENCES public.quote_charge_legacy_reviews(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 4000 AND reason ~ '[^[:space:]]'),
  evidence text NOT NULL CHECK (length(btrim(evidence)) BETWEEN 3 AND 10000 AND evidence ~ '[^[:space:]]'),
  request_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, request_key)
);
ALTER TABLE public.quote_charge_legacy_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_charge_legacy_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_charge_legacy_reviews, public.quote_charge_legacy_reversals FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.quote_charge_legacy_reviews TO authenticated;
GRANT SELECT ON public.quote_charge_legacy_reversals TO authenticated;
CREATE POLICY quote_charge_legacy_reviews_read ON public.quote_charge_legacy_reviews FOR SELECT TO authenticated
  USING (organization_id = public.current_internal_organization_id() AND public.is_internal_member(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo') OR public.has_role(auth.uid(),'auditor')));
CREATE POLICY quote_charge_legacy_reversals_read ON public.quote_charge_legacy_reversals FOR SELECT TO authenticated
  USING (organization_id = public.current_internal_organization_id() AND public.is_internal_member(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo') OR public.has_role(auth.uid(),'auditor')));
CREATE FUNCTION public.guard_quote_charge_legacy_audit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría de conciliación es inmutable; registra una reversión.' USING ERRCODE='23514', CONSTRAINT='quote_charge_audit_immutable';
END $$;
REVOKE ALL ON FUNCTION public.guard_quote_charge_legacy_audit() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER quote_charge_legacy_reviews_immutable BEFORE UPDATE OR DELETE ON public.quote_charge_legacy_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_quote_charge_legacy_audit();
CREATE TRIGGER quote_charge_legacy_reversals_immutable BEFORE UPDATE OR DELETE ON public.quote_charge_legacy_reversals
  FOR EACH ROW EXECUTE FUNCTION public.guard_quote_charge_legacy_audit();
--> statement-breakpoint

CREATE FUNCTION public.quote_charge_line_hash(p_line jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT encode(pg_catalog.sha256(convert_to(p_line::text,'UTF8')),'hex');
$$;
CREATE FUNCTION public.quote_charge_invoice_quote_ids(p_invoice_id uuid, p_org uuid)
RETURNS uuid[] LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) FROM (
    SELECT i.quote_id AS id FROM public.invoices i WHERE i.id=p_invoice_id AND i.organization_id=p_org
    UNION SELECT b.quote_id FROM public.bookings b JOIN public.invoices i ON i.id=p_invoice_id AND i.organization_id=p_org
      WHERE b.organization_id=p_org AND (b.id=i.booking_id OR EXISTS (
        SELECT 1 FROM public.invoice_bookings ib WHERE ib.invoice_id=i.id AND ib.booking_id=b.id AND ib.organization_id=p_org))
  ) scope WHERE id IS NOT NULL;
$$;
-- One canonical consumption calculation, shared by reads, native invoice writes
-- and review/reactivation. Exclusion is per invoice; native exclusion is per line.
CREATE FUNCTION public.quote_charge_native_line_valid(p_line jsonb, p_invoice public.invoices)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_source jsonb; v_quantity numeric; v_source_quantity numeric;
BEGIN
  IF nullif(p_line->>'source_quote_id','') IS NULL OR nullif(p_line->>'source_quote_line_id','') IS NULL THEN RETURN false; END IF;
  SELECT ql INTO v_source FROM public.quotes q CROSS JOIN LATERAL jsonb_array_elements(q.line_items) ql
    WHERE q.id::text=p_line->>'source_quote_id' AND q.organization_id=p_invoice.organization_id
      AND q.id=ANY(public.quote_charge_invoice_quote_ids(p_invoice.id,p_invoice.organization_id))
      AND q.customer_id IS NOT NULL AND q.customer_id=p_invoice.customer_id
      AND upper(q.currency)=upper(coalesce(p_invoice.moneda,'MXN'))
      AND ql->>'quote_line_id'=p_line->>'source_quote_line_id' AND ql->>'line_kind'='charge';
  IF NOT FOUND THEN RETURN false; END IF;
  BEGIN
    v_quantity := (p_line->>'quantity')::numeric;
    v_source_quantity := (v_source->>'quantity')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
  END;
  RETURN coalesce(v_quantity>0 AND v_quantity<=v_source_quantity
    AND v_quantity::text NOT IN ('NaN','Infinity','-Infinity')
    AND v_source_quantity>0 AND v_source_quantity::text NOT IN ('NaN','Infinity','-Infinity'),false);
END;
$$;
CREATE FUNCTION public.quote_charge_consumed(p_quote_id uuid, p_line_id uuid, p_exclude_invoice_id uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(sum(quantity),0) FROM (
    SELECT (li->>'quantity')::numeric AS quantity FROM public.quotes q
      JOIN public.invoices i ON i.organization_id=q.organization_id
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.line_items)='array' THEN i.line_items ELSE '[]'::jsonb END) li
      WHERE q.id=p_quote_id AND i.id IS DISTINCT FROM p_exclude_invoice_id AND public.quote_charge_invoice_active(i)
        AND li->>'source_quote_id'=q.id::text AND li->>'source_quote_line_id'=p_line_id::text
    UNION ALL
    SELECT r.quantity FROM public.quote_charge_legacy_reviews r JOIN public.invoices i
      ON i.id=r.invoice_id AND i.organization_id=r.organization_id
      WHERE r.quote_id=p_quote_id AND r.quote_line_id=p_line_id AND r.classification='charge'
        AND i.id IS DISTINCT FROM p_exclude_invoice_id AND public.quote_charge_invoice_active(i)
        AND NOT EXISTS (SELECT 1 FROM public.quote_charge_legacy_reversals x WHERE x.review_id=r.id)
        AND NOT ((i.line_items->r.invoice_line_index) ? 'source_quote_id'
          OR (i.line_items->r.invoice_line_index) ? 'source_quote_line_id')
  ) consumption;
$$;
CREATE FUNCTION public.quote_charge_legacy_invoice_pending(p_invoice public.invoices, p_quote_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_invoice.quote_charge_tracking_version IS NULL
    AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.id=p_quote_id AND q.organization_id=p_invoice.organization_id
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.line_items) ql WHERE ql->>'line_kind'='charge'))
    AND (jsonb_typeof(p_invoice.line_items) IS DISTINCT FROM 'array'
      OR (jsonb_array_length(CASE WHEN jsonb_typeof(p_invoice.line_items)='array' THEN p_invoice.line_items ELSE '[]'::jsonb END)=0 AND coalesce(p_invoice.subtotal,0)>0)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_invoice.line_items)='array'
          THEN p_invoice.line_items ELSE '[]'::jsonb END) WITH ORDINALITY l(line,ordinal)
        WHERE NOT public.quote_charge_native_line_valid(l.line,p_invoice)
          AND (NOT public.quote_charge_is_generated_equipment_line(l.line)
            OR l.line ? 'source_quote_id' OR l.line ? 'source_quote_line_id')
          AND NOT EXISTS (SELECT 1 FROM public.quote_charge_legacy_reviews r
            WHERE r.organization_id=p_invoice.organization_id AND r.invoice_id=p_invoice.id AND r.quote_id=p_quote_id
              AND r.invoice_line_index=l.ordinal-1 AND r.invoice_line_snapshot=l.line
              AND r.invoice_line_hash=public.quote_charge_line_hash(l.line)
              AND NOT EXISTS (SELECT 1 FROM public.quote_charge_legacy_reversals x WHERE x.review_id=r.id))));
$$;
-- The prospective row is required in BEFORE UPDATE: the stored row may still
-- be cancelled. Include native and reconciled quantities of this one source,
-- so a mixed historical invoice cannot pass two independent partial checks.
CREATE FUNCTION public.quote_charge_invoice_quantity(p_invoice public.invoices, p_quote_id uuid, p_line_id uuid)
RETURNS numeric LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(sum(quantity),0) FROM (
    SELECT (li->>'quantity')::numeric AS quantity FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_invoice.line_items)='array' THEN p_invoice.line_items ELSE '[]'::jsonb END) li
      WHERE li->>'source_quote_id'=p_quote_id::text AND li->>'source_quote_line_id'=p_line_id::text
    UNION ALL SELECT r.quantity FROM public.quote_charge_legacy_reviews r
      WHERE r.invoice_id=p_invoice.id AND r.organization_id=p_invoice.organization_id AND r.quote_id=p_quote_id
        AND r.quote_line_id=p_line_id AND r.classification='charge'
        AND NOT EXISTS (SELECT 1 FROM public.quote_charge_legacy_reversals x WHERE x.review_id=r.id)
        AND NOT ((p_invoice.line_items->r.invoice_line_index) ? 'source_quote_id'
          OR (p_invoice.line_items->r.invoice_line_index) ? 'source_quote_line_id')
  ) own_consumption;
$$;
CREATE OR REPLACE FUNCTION public.quote_has_legacy_charge_history(p_quote_id uuid, p_exclude_invoice_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quotes q JOIN public.invoices i ON i.organization_id=q.organization_id
    WHERE q.id=p_quote_id
      -- No additional charges means no charge reconciliation gate. Adding a
      -- charge later restores the gate without changing any historical marker.
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.line_items) ql WHERE ql->>'line_kind'='charge')
      AND i.id IS DISTINCT FROM p_exclude_invoice_id AND i.quote_charge_tracking_version IS NULL
      AND public.quote_charge_invoice_active(i) AND q.id=ANY(public.quote_charge_invoice_quote_ids(i.id,i.organization_id))
      AND public.quote_charge_legacy_invoice_pending(i,q.id)
  );
$$;
REVOKE ALL ON FUNCTION public.quote_charge_line_hash(jsonb), public.quote_charge_invoice_quote_ids(uuid,uuid),
  public.quote_charge_consumed(uuid,uuid,uuid), public.quote_charge_native_line_valid(jsonb,public.invoices), public.quote_charge_legacy_invoice_pending(public.invoices,uuid),
  public.quote_charge_invoice_quantity(public.invoices,uuid,uuid),
  public.quote_has_legacy_charge_history(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.quote_charge_legacy_reviews ADD CONSTRAINT quote_charge_review_hash_match
  CHECK (invoice_line_hash=public.quote_charge_line_hash(invoice_line_snapshot));
--> statement-breakpoint

CREATE FUNCTION public.reconcile_quote_charge_history(p_quote_id uuid, p_invoice_id uuid, p_line_index integer,
  p_expected_hash text, p_classification text, p_quote_line_id uuid, p_quantity numeric,
  p_reason text, p_evidence text, p_request_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid(); v_org uuid := public.current_internal_organization_id();
  v_invoice public.invoices%ROWTYPE; v_quote public.quotes%ROWTYPE; v_line jsonb; v_source jsonb;
  v_review public.quote_charge_legacy_reviews%ROWTYPE; v_id uuid; v_source_quantity numeric;
BEGIN
  IF v_actor IS NULL OR v_org IS NULL OR NOT public.is_internal_member(v_actor) OR NOT public.has_role(v_actor,'admin') THEN
    RAISE EXCEPTION 'Sólo un administrador interno puede conciliar cargos históricos.' USING ERRCODE='42501';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La conciliación requiere una transacción READ COMMITTED.' USING ERRCODE='25001';
  END IF;
  IF p_request_key IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 4000
    OR length(btrim(coalesce(p_evidence,''))) NOT BETWEEN 3 AND 10000
    OR p_reason !~ '[^[:space:]]' OR p_evidence !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'Indica motivo, evidencia y clave de solicitud de la revisión.' USING ERRCODE='22023';
  END IF;
  -- Do not acquire booking locks after invoice/quote. Existing booking and pivot
  -- guards lock this invoice (or fail NOWAIT), stabilizing its association scope.
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura inexistente o no autorizada.' USING ERRCODE='42501'; END IF;
  FOR v_id IN SELECT DISTINCT unnest(public.quote_charge_invoice_quote_ids(p_invoice_id,v_org) || ARRAY[p_quote_id]) ORDER BY 1 LOOP
    PERFORM 1 FROM public.quotes WHERE id=v_id AND organization_id=v_org FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cotización inexistente o no autorizada.' USING ERRCODE='42501'; END IF;
  END LOOP;
  SELECT * INTO v_review FROM public.quote_charge_legacy_reviews WHERE organization_id=v_org AND request_key=p_request_key;
  IF FOUND THEN
    IF ROW(v_review.invoice_id,v_review.quote_id,v_review.invoice_line_index,v_review.invoice_line_hash,v_review.classification,
        v_review.quote_line_id,v_review.quantity,v_review.reason,v_review.evidence,v_review.actor_id)
      IS DISTINCT FROM ROW(p_invoice_id,p_quote_id,p_line_index,p_expected_hash,p_classification,p_quote_line_id,p_quantity,btrim(p_reason),btrim(p_evidence),v_actor) THEN
      RAISE EXCEPTION 'La clave de solicitud ya se usó para otra revisión.' USING ERRCODE='23514', CONSTRAINT='quote_charge_review_idempotency';
    END IF;
    RETURN jsonb_build_object('complete',true,'review_id',v_review.id,'already_existed',true);
  END IF;
  SELECT * INTO v_quote FROM public.quotes WHERE id=p_quote_id AND organization_id=v_org;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_quote.line_items) ql WHERE ql->>'line_kind'='charge') THEN
    RAISE EXCEPTION 'Esta cotización no tiene cargos adicionales que conciliar.' USING ERRCODE='23514';
  END IF;
  IF v_invoice.quote_charge_tracking_version IS NOT NULL OR NOT p_quote_id=ANY(public.quote_charge_invoice_quote_ids(p_invoice_id,v_org))
    OR v_quote.customer_id IS NULL OR v_invoice.customer_id IS NULL OR v_quote.customer_id IS DISTINCT FROM v_invoice.customer_id
    OR upper(v_quote.currency) IS DISTINCT FROM upper(coalesce(v_invoice.moneda,'MXN')) THEN
    RAISE EXCEPTION 'La factura histórica debe pertenecer al mismo cliente, moneda y alcance de cotización.' USING ERRCODE='23514';
  END IF;
  IF p_line_index IS NULL OR p_line_index<0 OR jsonb_typeof(v_invoice.line_items) IS DISTINCT FROM 'array'
    OR p_line_index>=jsonb_array_length(v_invoice.line_items) THEN
    RAISE EXCEPTION 'La partida histórica no existe; no se pueden inventar partidas.' USING ERRCODE='23514';
  END IF;
  v_line := v_invoice.line_items->p_line_index;
  IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' OR public.quote_charge_line_hash(v_line) IS DISTINCT FROM p_expected_hash
    OR v_line ? 'source_quote_id' OR v_line ? 'source_quote_line_id' OR public.quote_charge_is_generated_equipment_line(v_line) THEN
    RAISE EXCEPTION 'La evidencia cambió o la partida ya tiene un origen nativo; actualiza la revisión.' USING ERRCODE='23514', CONSTRAINT='quote_charge_review_snapshot';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quote_charge_legacy_reviews r WHERE r.invoice_id=p_invoice_id AND r.invoice_line_index=p_line_index
    AND r.quote_id=p_quote_id AND NOT EXISTS (SELECT 1 FROM public.quote_charge_legacy_reversals x WHERE x.review_id=r.id)) THEN
    RAISE EXCEPTION 'Esta partida ya tiene una revisión vigente para la cotización.' USING ERRCODE='23514', CONSTRAINT='quote_charge_review_unique';
  END IF;
  IF p_classification='charge' THEN
    IF p_quote_line_id IS NULL OR p_quantity IS NULL OR p_quantity<=0 OR p_quantity::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'La cantidad conciliada debe ser positiva y finita.' USING ERRCODE='23514';
    END IF;
    SELECT value INTO v_source FROM jsonb_array_elements(v_quote.line_items)
      WHERE value->>'quote_line_id'=p_quote_line_id::text AND value->>'line_kind'='charge';
    v_source_quantity := (v_source->>'quantity')::numeric;
    IF v_source IS NULL OR v_source_quantity IS NULL OR v_source_quantity<=0 OR v_source_quantity::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Selecciona un cargo válido de esta cotización.' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.quote_charge_legacy_reviews r WHERE r.invoice_id=p_invoice_id AND r.invoice_line_index=p_line_index
      AND r.classification='charge' AND NOT EXISTS (SELECT 1 FROM public.quote_charge_legacy_reversals x WHERE x.review_id=r.id)) THEN
      RAISE EXCEPTION 'La partida histórica ya está asignada a otro cargo.' USING ERRCODE='23514', CONSTRAINT='quote_charge_review_unique';
    END IF;
    IF p_quantity>v_source_quantity OR (public.quote_charge_invoice_active(v_invoice)
      AND public.quote_charge_consumed(p_quote_id,p_quote_line_id,NULL)+p_quantity>v_source_quantity) THEN
      RAISE EXCEPTION 'La conciliación supera el saldo disponible del cargo.' USING ERRCODE='23514', CONSTRAINT='quote_charge_quantity_available';
    END IF;
  ELSIF p_classification NOT IN ('rental','not_quote_charge') OR p_classification IS NULL OR p_quote_line_id IS NOT NULL OR p_quantity IS NOT NULL THEN
    RAISE EXCEPTION 'Clasificación de revisión inválida.' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.quote_charge_legacy_reviews(organization_id,invoice_id,quote_id,invoice_line_index,invoice_line_snapshot,invoice_line_hash,invoice_booking_ids,
    classification,quote_line_id,quantity,actor_id,reason,evidence,request_key)
    VALUES(v_org,p_invoice_id,p_quote_id,p_line_index,v_line,p_expected_hash,
      (SELECT coalesce(array_agg(ib.booking_id ORDER BY ib.booking_id),'{}'::uuid[]) FROM public.invoice_bookings ib WHERE ib.invoice_id=p_invoice_id AND ib.organization_id=v_org),
      p_classification,p_quote_line_id,p_quantity,v_actor,btrim(p_reason),btrim(p_evidence),p_request_key)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('complete',true,'review_id',v_id,'already_existed',false);
END $$;

CREATE FUNCTION public.reverse_quote_charge_history(p_review_id uuid, p_reason text, p_evidence text, p_request_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid(); v_org uuid := public.current_internal_organization_id();
  v_review public.quote_charge_legacy_reviews%ROWTYPE; v_reversal public.quote_charge_legacy_reversals%ROWTYPE; v_id uuid;
BEGIN
  IF v_actor IS NULL OR v_org IS NULL OR NOT public.is_internal_member(v_actor) OR NOT public.has_role(v_actor,'admin') THEN
    RAISE EXCEPTION 'Sólo un administrador interno puede revertir una conciliación.' USING ERRCODE='42501';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La conciliación requiere una transacción READ COMMITTED.' USING ERRCODE='25001';
  END IF;
  IF p_request_key IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 4000
    OR length(btrim(coalesce(p_evidence,''))) NOT BETWEEN 3 AND 10000
    OR p_reason !~ '[^[:space:]]' OR p_evidence !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'Indica motivo, evidencia y clave de solicitud de la reversión.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_review FROM public.quote_charge_legacy_reviews WHERE id=p_review_id AND organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión inexistente o no autorizada.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.invoices WHERE id=v_review.invoice_id AND organization_id=v_org FOR UPDATE;
  FOR v_id IN SELECT DISTINCT unnest(public.quote_charge_invoice_quote_ids(v_review.invoice_id,v_org) || ARRAY[v_review.quote_id]) ORDER BY 1 LOOP
    PERFORM 1 FROM public.quotes WHERE id=v_id AND organization_id=v_org FOR NO KEY UPDATE;
  END LOOP;
  SELECT * INTO v_reversal FROM public.quote_charge_legacy_reversals WHERE organization_id=v_org AND request_key=p_request_key;
  IF FOUND THEN
    IF ROW(v_reversal.review_id,v_reversal.reason,v_reversal.evidence,v_reversal.actor_id)
      IS DISTINCT FROM ROW(p_review_id,btrim(p_reason),btrim(p_evidence),v_actor) THEN
      RAISE EXCEPTION 'La clave de solicitud ya se usó para otra reversión.' USING ERRCODE='23514', CONSTRAINT='quote_charge_review_idempotency';
    END IF;
    RETURN jsonb_build_object('complete',true,'review_id',p_review_id,'reversal_id',v_reversal.id,'already_existed',true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.quote_charge_legacy_reversals WHERE review_id=p_review_id) THEN
    RAISE EXCEPTION 'La revisión ya fue revertida; actualiza el historial.' USING ERRCODE='23514', CONSTRAINT='quote_charge_review_unique';
  END IF;
  INSERT INTO public.quote_charge_legacy_reversals(organization_id,review_id,actor_id,reason,evidence,request_key)
    VALUES(v_org,p_review_id,v_actor,btrim(p_reason),btrim(p_evidence),p_request_key) RETURNING id INTO v_id;
  RETURN jsonb_build_object('complete',true,'review_id',p_review_id,'reversal_id',v_id,'already_existed',false);
END $$;
REVOKE ALL ON FUNCTION public.reconcile_quote_charge_history(uuid,uuid,integer,text,text,uuid,numeric,text,text,uuid),
  public.reverse_quote_charge_history(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_quote_charge_history(uuid,uuid,integer,text,text,uuid,numeric,text,text,uuid),
  public.reverse_quote_charge_history(uuid,text,text,uuid) TO authenticated;
--> statement-breakpoint

CREATE FUNCTION public.get_quote_charge_legacy_review(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid(); v_org uuid := public.current_internal_organization_id();
  v_quote public.quotes%ROWTYPE; v_invoice public.invoices%ROWTYPE; v_line jsonb;
  v_invoices jsonb := '[]'; v_lines jsonb; v_history jsonb; v_review jsonb; v_index integer;
  v_availability jsonb;
BEGIN
  IF v_actor IS NULL OR v_org IS NULL OR NOT public.is_internal_member(v_actor)
    OR NOT (public.has_role(v_actor,'admin') OR public.has_role(v_actor,'administrativo') OR public.has_role(v_actor,'auditor')) THEN
    RAISE EXCEPTION 'No autorizado para consultar la revisión histórica.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_quote FROM public.quotes WHERE id=p_quote_id AND organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización inexistente o no autorizada.' USING ERRCODE='42501'; END IF;
  v_availability := public.get_quote_charge_availability(ARRAY[p_quote_id],NULL);
  SELECT * INTO v_quote FROM public.quotes WHERE id=p_quote_id AND organization_id=v_org;
  FOR v_invoice IN SELECT i.* FROM public.invoices i WHERE i.organization_id=v_org AND i.quote_charge_tracking_version IS NULL
    AND p_quote_id=ANY(public.quote_charge_invoice_quote_ids(i.id,v_org)) ORDER BY i.invoice_number,i.id LOOP
    v_lines := '[]';
    FOR v_line,v_index IN SELECT l.line,(l.ordinal-1)::integer
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.line_items)='array' THEN v_invoice.line_items ELSE '[]'::jsonb END)
        WITH ORDINALITY l(line,ordinal)
      WHERE NOT public.quote_charge_native_line_valid(l.line,v_invoice)
        AND (NOT public.quote_charge_is_generated_equipment_line(l.line)
          OR l.line ? 'source_quote_id' OR l.line ? 'source_quote_line_id') LOOP
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'classification',r.classification,'quote_line_id',r.quote_line_id,
        'quantity',r.quantity,'reason',r.reason,'evidence',r.evidence,'actor_id',r.actor_id,'created_at',r.created_at,
        'snapshot_valid',r.invoice_line_snapshot=v_line AND r.invoice_line_hash=public.quote_charge_line_hash(v_line),
        'reversed_at',x.created_at,'reversal_reason',x.reason,'reversal_evidence',x.evidence,'reversed_by',x.actor_id)
        ORDER BY r.created_at,r.id),'[]'::jsonb) INTO v_history
        FROM public.quote_charge_legacy_reviews r LEFT JOIN public.quote_charge_legacy_reversals x ON x.review_id=r.id
        WHERE r.organization_id=v_org AND r.invoice_id=v_invoice.id AND r.quote_id=p_quote_id AND r.invoice_line_index=v_index;
      SELECT value INTO v_review FROM jsonb_array_elements(v_history) WHERE value->>'reversed_at' IS NULL AND value->>'snapshot_valid'='true';
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('line_index',v_index,'line',v_line,
        'line_hash',public.quote_charge_line_hash(v_line),'pending',v_review IS NULL,
        'reviewable',jsonb_typeof(v_line)='object' AND NOT (v_line ? 'source_quote_id' OR v_line ? 'source_quote_line_id'),
        'blocked_reason',CASE WHEN jsonb_typeof(v_line) IS DISTINCT FROM 'object' THEN 'La partida original no es un objeto válido; requiere una revisión técnica independiente.'
          WHEN v_line ? 'source_quote_id' OR v_line ? 'source_quote_line_id' THEN 'La partida contiene un origen nativo incompleto o no verificable; requiere una revisión técnica independiente.' ELSE NULL END,
        'review',v_review,'history',v_history));
    END LOOP;
    IF jsonb_array_length(v_lines)>0 OR jsonb_typeof(v_invoice.line_items) IS DISTINCT FROM 'array'
      OR (jsonb_array_length(CASE WHEN jsonb_typeof(v_invoice.line_items)='array' THEN v_invoice.line_items ELSE '[]'::jsonb END)=0 AND coalesce(v_invoice.subtotal,0)>0) THEN
      v_invoices := v_invoices || jsonb_build_array(jsonb_build_object('invoice_id',v_invoice.id,'invoice_number',v_invoice.invoice_number,
        'status',v_invoice.status,'cfdi_status',v_invoice.cfdi_status,'cancellation_status',v_invoice.cancellation_status,
        'active',public.quote_charge_invoice_active(v_invoice),
        'reviewable',jsonb_typeof(v_invoice.line_items)='array' AND jsonb_array_length(v_lines)>0
          AND v_quote.customer_id IS NOT NULL AND v_invoice.customer_id IS NOT NULL AND v_quote.customer_id=v_invoice.customer_id
          AND upper(v_quote.currency)=upper(coalesce(v_invoice.moneda,'MXN')),
        'empty_positive',jsonb_array_length(CASE WHEN jsonb_typeof(v_invoice.line_items)='array' THEN v_invoice.line_items ELSE '[]'::jsonb END)=0
          AND coalesce(v_invoice.subtotal,0)>0,'lines',v_lines));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('complete',true,'quote_id',p_quote_id,'quote_number',v_quote.quote_number,
    'can_reconcile',public.has_role(v_actor,'admin') AND jsonb_array_length(v_availability#>'{quotes,0,lines}')>0,
    'charges',v_availability#>'{quotes,0,lines}','invoices',v_invoices);
END $$;
REVOKE ALL ON FUNCTION public.get_quote_charge_legacy_review(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_quote_charge_legacy_review(uuid) TO authenticated;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.get_quote_charge_availability(p_quote_ids uuid[], p_exclude_invoice_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
  v_org uuid := public.current_internal_organization_id();
  v_quote public.quotes%ROWTYPE; v_line jsonb; v_lines jsonb; v_quotes jsonb := '[]';
  v_quantity numeric; v_consumed numeric; v_id uuid;
BEGIN
  -- Preserve invoice-read roles. Sales/dispatch/mechanics/portal cannot use this
  -- SECURITY DEFINER read as an invoice-history side channel.
  IF NOT v_service AND (auth.uid() IS NULL OR v_org IS NULL OR NOT public.is_internal_member(auth.uid())
    OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo') OR public.has_role(auth.uid(),'auditor'))) THEN
    RAISE EXCEPTION 'No autorizado para consultar cargos facturables.' USING ERRCODE='42501';
  END IF;
  IF p_quote_ids IS NULL OR cardinality(p_quote_ids)>500 OR array_position(p_quote_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Cotizaciones inválidas.' USING ERRCODE='22023';
  END IF;
  IF p_exclude_invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.invoices i
      WHERE i.id=p_exclude_invoice_id AND (v_service OR i.organization_id=v_org)) THEN
    RAISE EXCEPTION 'Factura inexistente o no autorizada.' USING ERRCODE='42501';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La disponibilidad de cargos requiere READ COMMITTED.' USING ERRCODE='25001';
  END IF;
  FOR v_id IN SELECT DISTINCT unnest(p_quote_ids) ORDER BY 1 LOOP
    SELECT * INTO v_quote FROM public.quotes q WHERE q.id=v_id AND (v_service OR q.organization_id=v_org) FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cotización inexistente o no autorizada.' USING ERRCODE='42501'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_quote.line_items) ql
      WHERE ql->>'line_kind' IS NULL OR ql->>'line_kind' NOT IN ('charge','rental','sale')) THEN
      RAISE EXCEPTION 'La cotización tiene partidas adicionales sin clasificación verificable. Revisa la cotización.' USING ERRCODE='23514';
    END IF;
    v_lines := '[]';
    FOR v_line IN SELECT value FROM jsonb_array_elements(v_quote.line_items) WHERE value->>'line_kind'='charge' LOOP
      v_quantity := (v_line->>'quantity')::numeric;
      IF v_line->>'quote_line_id' IS NULL OR v_quantity IS NULL OR v_quantity<=0 OR v_quantity::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'Revisa las partidas de la cotización antes de facturar.' USING ERRCODE='23514';
      END IF;
      v_consumed := public.quote_charge_consumed(v_id,(v_line->>'quote_line_id')::uuid,p_exclude_invoice_id);
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('quote_line_id',v_line->>'quote_line_id',
        'line',v_line,'quoted_quantity',v_quantity,'consumed_quantity',v_consumed,'remaining_quantity',greatest(0,v_quantity-v_consumed)));
    END LOOP;
    v_quotes := v_quotes || jsonb_build_array(jsonb_build_object('quote_id',v_id,
      'legacy_review_required',public.quote_has_legacy_charge_history(v_id,NULL),'lines',v_lines));
  END LOOP;
  RETURN jsonb_build_object('complete',true,'quotes',v_quotes);
END $$;
--> statement-breakpoint

-- Quote row updates already own their quote lock. Read the immutable audit
-- without locking invoices, so concurrent invoice -> quote writers cannot invert.
CREATE FUNCTION public.guard_reviewed_quote_charge_header()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Los cambios de cotización requieren READ COMMITTED.' USING ERRCODE='25001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quote_charge_legacy_reviews r WHERE r.quote_id=OLD.id) THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION 'La cotización tiene evidencia histórica auditada y no puede eliminarse.'
        USING ERRCODE='23514', CONSTRAINT='quote_charge_review_scope';
    END IF;
    IF ROW(NEW.id,NEW.organization_id,NEW.customer_id,NEW.currency)
      IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.customer_id,OLD.currency) THEN
      RAISE EXCEPTION 'La cotización conserva cliente, moneda y empresa de sus revisiones históricas.'
        USING ERRCODE='23514', CONSTRAINT='quote_charge_review_scope';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_reviewed_quote_charge_header() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zz_guard_reviewed_quote_charge_header BEFORE DELETE OR UPDATE OF id,organization_id,customer_id,currency ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_quote_charge_header();

CREATE OR REPLACE FUNCTION public.guard_booking_quote_charge_origin()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_quote_id uuid; v_quote_ids uuid[];
BEGIN
  IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.organization_id,NEW.customer_id,NEW.quote_id)
    IS NOT DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.customer_id,OLD.quote_id) THEN RETURN NEW; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Los cambios de origen de reserva requieren READ COMMITTED.' USING ERRCODE='25001';
  END IF;
  v_quote_ids:=ARRAY[OLD.quote_id];
  IF TG_OP='UPDATE' THEN v_quote_ids:=array_append(v_quote_ids,NEW.quote_id); END IF;
  FOR v_id IN SELECT i.id FROM public.invoices i WHERE i.organization_id=OLD.organization_id
    AND (i.booking_id=OLD.id OR EXISTS (SELECT 1 FROM public.invoice_bookings ib
      WHERE ib.invoice_id=i.id AND ib.booking_id=OLD.id AND ib.organization_id=OLD.organization_id)) ORDER BY i.id LOOP
    -- A booking writer already owns the booking tuple; never wait for an
    -- invoice writer that may be waiting for this booking in existing guards.
    BEGIN PERFORM 1 FROM public.invoices WHERE id=v_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'Una factura está siendo editada. Reintenta el cambio de cotización.' USING ERRCODE='55P03';
    END;
    v_quote_ids:=v_quote_ids || public.quote_charge_invoice_quote_ids(v_id,OLD.organization_id);
    IF EXISTS (SELECT 1 FROM public.quote_charge_legacy_reviews r WHERE r.invoice_id=v_id)
      OR EXISTS (SELECT 1 FROM public.invoices i,LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.line_items)='array' THEN i.line_items ELSE '[]'::jsonb END) li
        WHERE i.id=v_id AND li ? 'source_quote_line_id') THEN
      RAISE EXCEPTION 'Una reserva con cargos o revisiones históricas conserva su origen, cliente y empresa.'
        USING ERRCODE='23514', CONSTRAINT='quote_charge_review_scope';
    END IF;
  END LOOP;
  -- Scope changes without a review also serialize with charge allocation. This
  -- writer already owns booking, so fail/retry instead of waiting on a quote.
  FOR v_quote_id IN SELECT DISTINCT id FROM unnest(v_quote_ids) id WHERE id IS NOT NULL ORDER BY 1 LOOP
    BEGIN
      PERFORM 1 FROM public.quotes WHERE id=v_quote_id AND organization_id=OLD.organization_id FOR NO KEY UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'Una cotización está siendo editada. Reintenta el cambio de origen de la reserva.' USING ERRCODE='55P03';
    END;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER zzz_guard_booking_quote_charge_origin ON public.bookings;
CREATE TRIGGER zzz_guard_booking_quote_charge_origin BEFORE DELETE OR UPDATE OF id,organization_id,customer_id,quote_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_quote_charge_origin();

CREATE OR REPLACE FUNCTION public.lock_invoice_quote_charge_link_change()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_quote_id uuid; v_ids uuid[]; v_booking_ids uuid[]; v_org uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Los cambios de vínculos de factura requieren READ COMMITTED.' USING ERRCODE='25001';
  END IF;
  IF TG_OP='INSERT' THEN v_ids:=ARRAY[NEW.invoice_id]; v_booking_ids:=ARRAY[NEW.booking_id];
  ELSIF TG_OP='DELETE' THEN v_ids:=ARRAY[OLD.invoice_id]; v_booking_ids:=ARRAY[OLD.booking_id];
  ELSE v_ids:=ARRAY[OLD.invoice_id,NEW.invoice_id]; v_booking_ids:=ARRAY[OLD.booking_id,NEW.booking_id]; END IF;
  FOR v_id IN SELECT DISTINCT unnest(v_ids) ORDER BY 1 LOOP
    BEGIN
      SELECT organization_id INTO v_org FROM public.invoices WHERE id=v_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'La factura está siendo editada. Reintenta el cambio de vínculos.' USING ERRCODE='55P03';
    END;
    -- INSERT's existing cancellation guard already locks invoice -> booking.
    -- A save may own source quote locks before pivot sync. NOWAIT prevents any
    -- subset-lock inversion while serializing changes of historical scope.
    FOR v_quote_id IN SELECT id FROM (
      SELECT unnest(public.quote_charge_invoice_quote_ids(v_id,v_org)) AS id
      UNION SELECT b.quote_id FROM public.bookings b WHERE b.id=ANY(v_booking_ids) AND b.organization_id=v_org
      UNION SELECT r.quote_id FROM public.quote_charge_legacy_reviews r WHERE r.invoice_id=v_id AND r.organization_id=v_org
    ) scopes WHERE id IS NOT NULL ORDER BY id LOOP
      BEGIN
        PERFORM 1 FROM public.quotes WHERE id=v_quote_id AND organization_id=v_org FOR NO KEY UPDATE NOWAIT;
      EXCEPTION WHEN lock_not_available THEN
        RAISE EXCEPTION 'Una cotización está siendo editada. Reintenta el cambio de vínculos.' USING ERRCODE='55P03';
      END;
    END LOOP;
  END LOOP;
  -- The deferred validation compares the final booking set to each immutable
  -- review snapshot. Existing DELETE/INSERT sync of an unchanged set is valid.
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER zz_lock_invoice_quote_charge_link_change ON public.invoice_bookings;
CREATE TRIGGER zz_lock_invoice_quote_charge_link_change BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_bookings
  FOR EACH ROW EXECUTE FUNCTION public.lock_invoice_quote_charge_link_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.normalize_quote_charge_identities()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_line jsonb; v_lines jsonb := '[]'; v_id uuid; v_ids uuid[] := '{}'; v_old jsonb;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Las partidas de cotización requieren READ COMMITTED.' USING ERRCODE='25001';
  END IF;
  IF jsonb_typeof(NEW.line_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Las partidas de cotización deben ser una lista.' USING ERRCODE='23514';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(NEW.line_items) LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Partida de cotización inválida.' USING ERRCODE='23514';
    END IF;
    v_id := coalesce(nullif(v_line->>'quote_line_id','')::uuid, gen_random_uuid());
    IF v_id = ANY(v_ids) THEN
      RAISE EXCEPTION 'Identidad de partida repetida en la cotización.' USING ERRCODE='23514', CONSTRAINT='quote_charge_price_immutable';
    END IF;
    v_ids := array_append(v_ids,v_id);
    v_line := v_line || jsonb_build_object('quote_line_id',v_id);
    IF nullif(v_line->>'line_kind','') IS NULL THEN
      v_line := v_line || jsonb_build_object('line_kind', CASE
        WHEN public.quote_charge_is_generated_equipment_line(v_line) THEN
          CASE WHEN v_line->>'description' LIKE '% - Venta de equipo' THEN 'sale' ELSE 'rental' END
        ELSE 'charge' END);
    END IF;
    IF v_line->>'line_kind' = 'charge' AND nullif(v_line->>'charge_kind','') IS NULL THEN
      IF v_line->>'description' = 'Servicio de Logística' THEN
        v_line := v_line || '{"charge_kind":"logistics"}'::jsonb;
      ELSIF v_line->>'description' = 'Seguro' THEN
        v_line := v_line || '{"charge_kind":"insurance"}'::jsonb;
      END IF;
    END IF;
    v_lines := v_lines || jsonb_build_array(v_line);
  END LOOP;
  -- A used identity cannot be removed or repurposed, including after cancellation.
  -- No invoice row locks: writers acquire invoice -> quote; this avoids inversion.
  IF TG_OP='UPDATE' THEN
    FOR v_old IN SELECT value FROM jsonb_array_elements(OLD.line_items) LOOP
      IF EXISTS (SELECT 1 FROM public.invoices i,
          LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.line_items)='array' THEN i.line_items ELSE '[]'::jsonb END) li
          WHERE i.organization_id=OLD.organization_id
            AND i.line_items @> jsonb_build_array(jsonb_build_object('source_quote_id',OLD.id))
            AND li->>'source_quote_id'=OLD.id::text
            AND li->>'source_quote_line_id'=v_old->>'quote_line_id')
        OR EXISTS (SELECT 1 FROM public.quote_charge_legacy_reviews r
          WHERE r.organization_id=OLD.organization_id AND r.quote_id=OLD.id AND r.classification='charge'
            AND r.quote_line_id::text=v_old->>'quote_line_id') THEN
        SELECT value INTO v_line FROM jsonb_array_elements(v_lines)
          WHERE value->>'quote_line_id'=v_old->>'quote_line_id';
        IF v_line IS NULL OR (v_line - 'total') IS DISTINCT FROM (v_old - 'total') THEN
          RAISE EXCEPTION 'Una partida de cotización facturada no puede eliminarse ni modificarse. Agrega una partida nueva para otro cargo.'
            USING ERRCODE='23514', CONSTRAINT='quote_charge_source_immutable';
        END IF;
      END IF;
    END LOOP;
  END IF;
  NEW.line_items := v_lines;
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.enforce_invoice_quote_charges()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old_lines jsonb := '[]'; v_new_lines jsonb := '[]'; v_line jsonb; v_source jsonb;
  v_quote public.quotes%ROWTYPE; v_id uuid; v_line_id uuid; v_quantity numeric; v_other numeric; v_source_quantity numeric; v_source_price numeric; v_source_discount numeric;
  v_review record; v_quote_ids uuid[] := '{}';
  v_org uuid; v_invoice_id uuid; v_active boolean; v_old_quote uuid; v_new_quote uuid; v_old_booking uuid; v_new_booking uuid; v_frozen boolean := false;
BEGIN
  -- Row locks alone do not refresh a REPEATABLE READ snapshot when a review
  -- only inserted audit records. Reject before consulting possibly invisible
  -- history, including historical invoices without any native source fields.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Los cambios de factura requieren READ COMMITTED.' USING ERRCODE='25001';
  END IF;
  IF TG_OP<>'INSERT' AND EXISTS (SELECT 1 FROM public.quote_charge_legacy_reviews r WHERE r.invoice_id=OLD.id) THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION 'La factura tiene evidencia histórica auditada y no puede eliminarse.' USING ERRCODE='23514', CONSTRAINT='quote_charge_review_snapshot';
    END IF;
    IF ROW(NEW.id,NEW.organization_id,NEW.customer_id,NEW.moneda,NEW.quote_id,NEW.booking_id,NEW.line_items)
      IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.customer_id,OLD.moneda,OLD.quote_id,OLD.booking_id,OLD.line_items)
      OR NEW.line_items::text IS DISTINCT FROM OLD.line_items::text THEN
      RAISE EXCEPTION 'La partida histórica, su cliente, moneda y vínculos son evidencia inmutable.' USING ERRCODE='23514', CONSTRAINT='quote_charge_review_snapshot';
    END IF;
  END IF;
  IF TG_OP<>'INSERT' THEN
    v_old_lines := OLD.line_items; v_old_quote:=OLD.quote_id; v_old_booking:=OLD.booking_id;
    v_frozen := OLD.quote_charge_ever_issued OR OLD.status NOT IN ('draft','cancelled')
      OR coalesce(OLD.cfdi_status IN ('stamping','stamped'),false) OR OLD.cfdi_uuid IS NOT NULL;
  END IF;
  IF TG_OP='DELETE' THEN
    v_org:=OLD.organization_id; v_invoice_id:=OLD.id;
    IF v_frozen AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_old_lines)='array' THEN v_old_lines ELSE '[]'::jsonb END) li WHERE li ? 'source_quote_line_id') THEN
      RAISE EXCEPTION 'Una factura emitida conserva el origen de sus cargos; cancélala para liberar cantidades.' USING ERRCODE='23514';
    END IF;
  ELSE
    IF TG_OP='INSERT' AND NEW.quote_charge_tracking_version IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'Las facturas nuevas requieren trazabilidad de cargos.' USING ERRCODE='23514';
    END IF;
    v_org:=NEW.organization_id; v_invoice_id:=NEW.id; v_new_lines:=NEW.line_items; v_new_quote:=NEW.quote_id; v_new_booking:=NEW.booking_id;
    NEW.quote_charge_ever_issued := v_frozen OR NEW.status NOT IN ('draft','cancelled')
      OR coalesce(NEW.cfdi_status IN ('stamping','stamped'),false) OR NEW.cfdi_uuid IS NOT NULL;
    IF TG_OP='UPDATE' AND NEW.quote_charge_tracking_version IS DISTINCT FROM OLD.quote_charge_tracking_version THEN
      RAISE EXCEPTION 'La trazabilidad histórica requiere revisión explícita; no puede cambiar al editar la factura.' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND v_frozen AND NEW.status='draft' AND OLD.status<>'draft' THEN
      RAISE EXCEPTION 'Una factura emitida no puede volver a borrador para liberar sus cargos.' USING ERRCODE='23514';
    END IF;
    IF v_frozen AND (
      SELECT coalesce(jsonb_agg(li ORDER BY li->>'source_quote_id',li->>'source_quote_line_id'),'[]') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_old_lines)='array' THEN v_old_lines ELSE '[]'::jsonb END) li WHERE li ? 'source_quote_line_id'
    ) IS DISTINCT FROM (
      SELECT coalesce(jsonb_agg(li ORDER BY li->>'source_quote_id',li->>'source_quote_line_id'),'[]') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_new_lines)='array' THEN v_new_lines ELSE '[]'::jsonb END) li WHERE li ? 'source_quote_line_id'
    ) THEN
      RAISE EXCEPTION 'Los cargos de una factura emitida conservan su origen y cantidades.' USING ERRCODE='23514';
    END IF;
    v_active:=public.quote_charge_invoice_active(NEW);
  END IF;
  -- All writers, including draft deletion/cancellation and recurring RPCs,
  -- serialize by the same source quote row, in deterministic UUID order.
  FOR v_id IN SELECT id FROM (
    SELECT q.id FROM public.quotes q JOIN jsonb_array_elements((CASE WHEN jsonb_typeof(v_old_lines)='array' THEN v_old_lines ELSE '[]'::jsonb END) || (CASE WHEN jsonb_typeof(v_new_lines)='array' THEN v_new_lines ELSE '[]'::jsonb END)) li
      ON li->>'source_quote_id'=q.id::text WHERE q.organization_id=v_org
    UNION SELECT v_old_quote UNION SELECT v_new_quote
    UNION SELECT r.quote_id FROM public.quote_charge_legacy_reviews r WHERE r.invoice_id=v_invoice_id AND r.organization_id=v_org
    UNION SELECT b.quote_id FROM public.bookings b WHERE b.organization_id=v_org AND (
      b.id IN (v_old_booking,v_new_booking) OR EXISTS (SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id=v_invoice_id AND ib.booking_id=b.id AND ib.organization_id=v_org))
  ) ids WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM 1 FROM public.quotes q WHERE q.id=v_id AND q.organization_id=v_org FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Origen de cargo inexistente o de otra empresa.' USING ERRCODE='23514'; END IF;
    v_quote_ids := array_append(v_quote_ids,v_id);
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  -- OLD is still the stored row in this BEFORE trigger. In particular, an
  -- inactive legacy invoice cannot be reactivated by relying on a history query
  -- that still sees OLD inactive, or on native source IDs it never had.
  IF TG_OP='UPDATE' AND v_active AND NOT public.quote_charge_invoice_active(OLD)
    AND NEW.quote_charge_tracking_version IS NULL THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'La reactivación requiere READ COMMITTED.' USING ERRCODE='25001';
    END IF;
    FOREACH v_id IN ARRAY v_quote_ids LOOP
      IF public.quote_charge_legacy_invoice_pending(NEW,v_id) THEN
        RAISE EXCEPTION 'La factura histórica conserva partidas pendientes de revisión para esta cotización.'
          USING ERRCODE='23514', CONSTRAINT='quote_charge_legacy_review';
      END IF;
    END LOOP;
  END IF;
  IF v_active THEN
    FOR v_review IN SELECT r.quote_id,r.quote_line_id,sum(r.quantity) AS quantity
      FROM public.quote_charge_legacy_reviews r WHERE r.invoice_id=v_invoice_id AND r.organization_id=v_org
        AND r.classification='charge' AND NOT EXISTS (SELECT 1 FROM public.quote_charge_legacy_reversals x WHERE x.review_id=r.id)
      GROUP BY r.quote_id,r.quote_line_id LOOP
      IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'Los cargos conciliados requieren READ COMMITTED.' USING ERRCODE='25001';
      END IF;
      SELECT value INTO v_source FROM public.quotes q CROSS JOIN LATERAL jsonb_array_elements(q.line_items) li(value)
        WHERE q.id=v_review.quote_id AND q.organization_id=v_org AND li.value->>'quote_line_id'=v_review.quote_line_id::text
          AND li.value->>'line_kind'='charge';
      v_source_quantity := (v_source->>'quantity')::numeric;
      IF v_source IS NULL OR v_source_quantity IS NULL OR v_source_quantity<=0 OR v_source_quantity::text IN ('NaN','Infinity','-Infinity')
        OR public.quote_charge_consumed(v_review.quote_id,v_review.quote_line_id,v_invoice_id)
          +public.quote_charge_invoice_quantity(NEW,v_review.quote_id,v_review.quote_line_id)>v_source_quantity THEN
        RAISE EXCEPTION 'La reactivación supera el saldo disponible del cargo conciliado.'
          USING ERRCODE='23514', CONSTRAINT='quote_charge_quantity_available';
      END IF;
    END LOOP;
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_new_lines)='array' THEN v_new_lines ELSE '[]'::jsonb END) LOOP
    -- An unchanged legacy payload may contain malformed native keys. Preserve
    -- non-consuming metadata/cancellation, without interpreting or repairing it.
    -- Reactivation was checked explicitly above against every scoped pending line.
    IF TG_OP='UPDATE' AND NEW.quote_charge_tracking_version IS NULL AND v_new_lines=v_old_lines
      AND (NOT v_active OR public.quote_charge_invoice_active(OLD)) THEN CONTINUE; END IF;
    IF (v_line ? 'source_quote_id') IS DISTINCT FROM (v_line ? 'source_quote_line_id')
      OR (NEW.quote_charge_tracking_version=1 AND v_line->>'line_kind'='charge' AND NOT (v_line ? 'source_quote_line_id')) THEN
      RAISE EXCEPTION 'El cargo requiere su cotización y partida de origen.' USING ERRCODE='23514';
    END IF;
    IF NOT (v_line ? 'source_quote_line_id') THEN CONTINUE; END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Los cargos deben guardarse en una transacción READ COMMITTED.' USING ERRCODE='25001';
    END IF;
    v_id:=nullif(v_line->>'source_quote_id','')::uuid;
    v_line_id:=nullif(v_line->>'source_quote_line_id','')::uuid;
    v_quantity:=(v_line->>'quantity')::numeric;
    IF v_id IS NULL OR v_line_id IS NULL OR v_line->>'source_quote_id' IS DISTINCT FROM v_id::text
      OR v_line->>'source_quote_line_id' IS DISTINCT FROM v_line_id::text
      OR v_quantity IS NULL OR v_quantity<=0 OR v_quantity::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Identidad o cantidad de cargo inválida.' USING ERRCODE='23514';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_new_lines)='array' THEN v_new_lines ELSE '[]'::jsonb END) li
      WHERE li->>'source_quote_id'=v_id::text AND li->>'source_quote_line_id'=v_line_id::text)>1 THEN
      RAISE EXCEPTION 'Un mismo cargo aparece repetido en la factura.' USING ERRCODE='23514';
    END IF;
    SELECT * INTO v_quote FROM public.quotes q WHERE q.id=v_id AND q.organization_id=v_org;
    SELECT value INTO v_source FROM jsonb_array_elements(v_quote.line_items)
      WHERE value->>'quote_line_id'=v_line_id::text AND value->>'line_kind'='charge';
    IF v_source IS NULL OR (v_quote.customer_id IS NOT NULL AND v_quote.customer_id IS DISTINCT FROM NEW.customer_id) THEN
      RAISE EXCEPTION 'El cargo no pertenece a una partida del cliente y cotización seleccionados.' USING ERRCODE='23514';
    END IF;
    v_source_quantity := (v_source->>'quantity')::numeric;
    v_source_price := (v_source->>'unit_price')::numeric;
    v_source_discount := coalesce((v_source->>'discount')::numeric,0);
    IF v_source_quantity IS NULL OR v_source_quantity<=0 OR v_source_quantity::text IN ('NaN','Infinity','-Infinity')
      OR v_source_price IS NULL OR v_source_price<0 OR v_source_price::text IN ('NaN','Infinity','-Infinity')
      OR v_source_discount<0 OR v_source_discount::text IN ('NaN','Infinity','-Infinity')
      OR coalesce(v_source->>'discount_type','%') NOT IN ('%','$')
      OR (coalesce(v_source->>'discount_type','%')='%' AND v_source_discount>100) THEN
      RAISE EXCEPTION 'La partida de origen tiene cantidad, precio o descuento inválido.' USING ERRCODE='23514';
    END IF;
    IF coalesce(upper(NEW.moneda),'MXN') IS DISTINCT FROM upper(v_quote.currency) THEN
      RAISE EXCEPTION 'La moneda de la factura no coincide con la cotización del cargo.' USING ERRCODE='23514', CONSTRAINT='quote_charge_currency_match';
    END IF;
    IF (v_line->>'unit_price')::numeric IS DISTINCT FROM (v_source->>'unit_price')::numeric
      OR coalesce((v_line->>'discount')::numeric,0) IS DISTINCT FROM coalesce((v_source->>'discount')::numeric,0)
      OR coalesce(v_line->>'discount_type','%') IS DISTINCT FROM coalesce(v_source->>'discount_type','%') THEN
      RAISE EXCEPTION 'El precio y descuento del cargo deben conservar lo pactado en la cotización.' USING ERRCODE='23514', CONSTRAINT='quote_charge_price_immutable';
    END IF;
    IF (v_line->>'total')::numeric IS DISTINCT FROM round(round(v_source_price,2)*v_quantity,2)
      OR (v_line ? 'amount' AND (v_line->>'amount')::numeric IS DISTINCT FROM round(round(v_source_price,2)*v_quantity,2)) THEN
      RAISE EXCEPTION 'El importe bruto del cargo debe coincidir con cantidad por precio pactado.'
        USING ERRCODE='23514', CONSTRAINT='quote_charge_total_match';
    END IF;
    -- Unchanged issued/cancelled rows remain editable for lifecycle metadata,
    -- even when unrelated legacy documents require manual reconciliation.
    IF TG_OP='UPDATE' AND v_new_lines=v_old_lines AND NOT v_active THEN CONTINUE; END IF;
    IF public.quote_has_legacy_charge_history(v_id,NULL) THEN
      RAISE EXCEPTION 'Hay facturas históricas con cargos sin origen verificable. Revisa el historial antes de facturar estos cargos.'
        USING ERRCODE='23514', CONSTRAINT='quote_charge_legacy_review';
    END IF;
    v_other := public.quote_charge_consumed(v_id,v_line_id,v_invoice_id);
    IF v_active AND public.quote_charge_invoice_quantity(NEW,v_id,v_line_id)+v_other>v_source_quantity THEN
      RAISE EXCEPTION 'La cantidad del cargo supera el saldo disponible. Actualiza los cargos de la cotización.'
        USING ERRCODE='23514', CONSTRAINT='quote_charge_quantity_available';
    END IF;
    IF coalesce((v_source->>'discount')::numeric,0)>0 AND v_source->>'discount_type'='$'
      AND v_quantity IS DISTINCT FROM (v_source->>'quantity')::numeric THEN
      RAISE EXCEPTION 'El descuento fijo del cargo requiere revisión antes de facturar una cantidad parcial.'
        USING ERRCODE='23514', CONSTRAINT='quote_charge_fixed_discount_review';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.validate_invoice_quote_charge_links()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_invoice public.invoices%ROWTYPE; v_id uuid; v_ids uuid[]; v_quotes uuid[]; v_line jsonb;
BEGIN
  IF TG_TABLE_NAME='invoices' THEN v_ids:=ARRAY[NEW.id];
  ELSIF TG_OP='DELETE' THEN v_ids:=ARRAY[OLD.invoice_id];
  ELSIF TG_OP='UPDATE' THEN v_ids:=ARRAY[OLD.invoice_id,NEW.invoice_id];
  ELSE v_ids:=ARRAY[NEW.invoice_id]; END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
  SELECT * INTO v_invoice FROM public.invoices WHERE id=v_id;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT array_agg(DISTINCT id) INTO v_quotes FROM (
    SELECT v_invoice.quote_id AS id
    UNION SELECT b.quote_id FROM public.bookings b WHERE b.organization_id=v_invoice.organization_id
      AND (b.id=v_invoice.booking_id OR EXISTS (SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id=v_id AND ib.booking_id=b.id AND ib.organization_id=v_invoice.organization_id))
  ) q WHERE id IS NOT NULL;
  FOR v_line IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.line_items)='array' THEN v_invoice.line_items ELSE '[]'::jsonb END) LOOP
    IF v_line ? 'source_quote_line_id' THEN
      -- Historical malformed source fields remain pending and cannot be
      -- reconciled by this flow. Do not prevent non-consuming lifecycle updates.
      IF v_invoice.quote_charge_tracking_version IS NULL
        AND NOT public.quote_charge_native_line_valid(v_line,v_invoice) THEN CONTINUE; END IF;
      IF NOT coalesce(v_line->>'source_quote_id'=ANY(SELECT id::text FROM unnest(v_quotes) id),false) THEN
        RAISE EXCEPTION 'El origen del cargo no está ligado a las reservas o cotización de esta factura.' USING ERRCODE='23514';
      END IF;
    ELSIF v_invoice.quote_charge_tracking_version=1 AND cardinality(v_quotes)>0 AND v_line->>'line_kind' IS DISTINCT FROM 'manual'
      AND NOT public.quote_charge_is_generated_equipment_line(v_line) THEN
      RAISE EXCEPTION 'Identifica el origen del cargo o captura explícitamente una partida manual.' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.quote_charge_legacy_reviews r WHERE r.invoice_id=v_invoice.id
    AND (r.organization_id IS DISTINCT FROM v_invoice.organization_id OR NOT coalesce(r.quote_id=ANY(v_quotes),false)
      OR r.invoice_booking_ids IS DISTINCT FROM (SELECT coalesce(array_agg(ib.booking_id ORDER BY ib.booking_id),'{}'::uuid[])
        FROM public.invoice_bookings ib WHERE ib.invoice_id=v_invoice.id AND ib.organization_id=v_invoice.organization_id))) THEN
    RAISE EXCEPTION 'La factura conserva el alcance de sus revisiones históricas, incluidas las revertidas.'
      USING ERRCODE='23514', CONSTRAINT='quote_charge_review_scope';
  END IF;
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
