-- Persistent quote charge identity. This initializes identities on actual quote
-- rows only; it NEVER attributes historical invoice lines by text or position.
-- Historical ambiguous billing stays unknown and requires explicit review.
ALTER TABLE public.invoices ADD COLUMN quote_charge_tracking_version smallint;
ALTER TABLE public.invoices ALTER COLUMN quote_charge_tracking_version SET DEFAULT 1;
ALTER TABLE public.invoices ADD COLUMN quote_charge_ever_issued boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD CONSTRAINT invoice_quote_charge_tracking_version
  CHECK (quote_charge_tracking_version IS NULL OR quote_charge_tracking_version = 1);
--> statement-breakpoint

-- Recognize only formats emitted by the application's rental/sale generators.
-- This excludes known rental-only history; it never matches a charge to a quote.
CREATE FUNCTION public.quote_charge_is_generated_equipment_line(p_line jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN nullif(p_line->>'line_kind','') IS NOT NULL THEN p_line->>'line_kind' IN ('rental','sale')
    ELSE coalesce(p_line->>'description' ~ '^.+ — Renta (mensual|semanal|diaria)( \(.*\))?$', false)
    OR coalesce(p_line->>'description' ~ '^(.+ — )?Extensión: Renta (mensual|semanal|diaria)( \(.*\))?$', false)
    OR coalesce(p_line->>'description' ~ '^.+ — Renta (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) [0-9]{4} \([0-9]+ días al precio diario\)$', false)
    OR coalesce(p_line->>'description' ~ '^.+ - Venta de equipo$', false) END;
$$;
REVOKE ALL ON FUNCTION public.quote_charge_is_generated_equipment_line(jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Drafts reserve quantities. Stamping/pending cancellation also reserve them.
-- Only a cancelled unfiscalized document or an accepted fiscal cancellation frees them.
CREATE FUNCTION public.quote_charge_invoice_active(p_invoice public.invoices)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_invoice.cfdi_status = 'stamping' THEN true
    WHEN p_invoice.cfdi_status = 'stamped' OR p_invoice.cfdi_uuid IS NOT NULL
      THEN p_invoice.cancellation_status IS DISTINCT FROM 'accepted'
    ELSE p_invoice.status IS DISTINCT FROM 'cancelled'
      AND p_invoice.cfdi_status IS DISTINCT FROM 'cancelled'
  END;
$$;
REVOKE ALL ON FUNCTION public.quote_charge_invoice_active(public.invoices) FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX invoices_quote_charge_origins_idx ON public.invoices USING gin (line_items jsonb_path_ops);

CREATE FUNCTION public.normalize_quote_charge_identities()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_line jsonb; v_lines jsonb := '[]'; v_id uuid; v_ids uuid[] := '{}'; v_old jsonb;
BEGIN
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
          LATERAL jsonb_array_elements(i.line_items) li
          WHERE i.organization_id=OLD.organization_id
            AND i.line_items @> jsonb_build_array(jsonb_build_object('source_quote_id',OLD.id))
            AND li->>'source_quote_id'=OLD.id::text
            AND li->>'source_quote_line_id'=v_old->>'quote_line_id') THEN
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
REVOKE ALL ON FUNCTION public.normalize_quote_charge_identities() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zz_normalize_quote_charge_identities BEFORE INSERT OR UPDATE OF line_items ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.normalize_quote_charge_identities();
-- Safe source initialization, with no historical invoice linkage/backfill.
UPDATE public.quotes SET line_items=line_items;
--> statement-breakpoint

CREATE FUNCTION public.quote_has_legacy_charge_history(p_quote_id uuid, p_exclude_invoice_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i JOIN public.quotes q ON q.id=p_quote_id AND q.organization_id=i.organization_id
    WHERE i.id IS DISTINCT FROM p_exclude_invoice_id
      AND i.quote_charge_tracking_version IS NULL
      AND public.quote_charge_invoice_active(i)
      AND (i.quote_id=q.id OR EXISTS (SELECT 1 FROM public.bookings b
        WHERE b.quote_id=q.id AND b.organization_id=q.organization_id
          AND (b.id=i.booking_id OR EXISTS (SELECT 1 FROM public.invoice_bookings ib
            WHERE ib.invoice_id=i.id AND ib.booking_id=b.id AND ib.organization_id=q.organization_id))))
      AND (jsonb_typeof(i.line_items) IS DISTINCT FROM 'array' OR (jsonb_array_length(i.line_items)=0 AND coalesce(i.subtotal,0)>0) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(i.line_items) li
        WHERE NOT public.quote_charge_is_generated_equipment_line(li)
          AND (li->>'source_quote_id' IS NULL OR li->>'source_quote_line_id' IS NULL)
      ))
  );
$$;
REVOKE ALL ON FUNCTION public.quote_has_legacy_charge_history(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_quote_charge_availability(p_quote_ids uuid[], p_exclude_invoice_id uuid DEFAULT NULL)
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
  FOR v_id IN SELECT DISTINCT unnest(p_quote_ids) ORDER BY 1 LOOP
    SELECT * INTO v_quote FROM public.quotes q WHERE q.id=v_id AND (v_service OR q.organization_id=v_org);
    IF NOT FOUND THEN RAISE EXCEPTION 'Cotización inexistente o no autorizada.' USING ERRCODE='42501'; END IF;
    v_lines := '[]';
    FOR v_line IN SELECT value FROM jsonb_array_elements(v_quote.line_items) WHERE value->>'line_kind'='charge' LOOP
      v_quantity := (v_line->>'quantity')::numeric;
      IF v_line->>'quote_line_id' IS NULL OR v_quantity IS NULL OR v_quantity<=0 OR v_quantity::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'Revisa las partidas de la cotización antes de facturar.' USING ERRCODE='23514';
      END IF;
      SELECT coalesce(sum((li->>'quantity')::numeric),0) INTO v_consumed
        FROM public.invoices i, LATERAL jsonb_array_elements(i.line_items) li
        WHERE i.organization_id=v_quote.organization_id AND i.id IS DISTINCT FROM p_exclude_invoice_id
          AND public.quote_charge_invoice_active(i)
          AND i.line_items @> jsonb_build_array(jsonb_build_object('source_quote_id',v_id))
          AND li->>'source_quote_id'=v_id::text AND li->>'source_quote_line_id'=v_line->>'quote_line_id';
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('quote_line_id',v_line->>'quote_line_id',
        'line',v_line,'quoted_quantity',v_quantity,'consumed_quantity',v_consumed,'remaining_quantity',greatest(0,v_quantity-v_consumed)));
    END LOOP;
    v_quotes := v_quotes || jsonb_build_array(jsonb_build_object('quote_id',v_id,
      'legacy_review_required',public.quote_has_legacy_charge_history(v_id,NULL),'lines',v_lines));
  END LOOP;
  RETURN jsonb_build_object('complete',true,'quotes',v_quotes);
END $$;
REVOKE ALL ON FUNCTION public.get_quote_charge_availability(uuid[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quote_charge_availability(uuid[],uuid) TO authenticated, service_role;
--> statement-breakpoint

CREATE FUNCTION public.enforce_invoice_quote_charges()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old_lines jsonb := '[]'; v_new_lines jsonb := '[]'; v_line jsonb; v_source jsonb;
  v_quote public.quotes%ROWTYPE; v_id uuid; v_line_id uuid; v_quantity numeric; v_other numeric; v_source_quantity numeric; v_source_price numeric; v_source_discount numeric;
  v_org uuid; v_invoice_id uuid; v_active boolean; v_old_quote uuid; v_new_quote uuid; v_old_booking uuid; v_new_booking uuid; v_frozen boolean := false;
BEGIN
  IF TG_OP<>'INSERT' THEN
    v_old_lines := OLD.line_items; v_old_quote:=OLD.quote_id; v_old_booking:=OLD.booking_id;
    v_frozen := OLD.quote_charge_ever_issued OR OLD.status NOT IN ('draft','cancelled')
      OR coalesce(OLD.cfdi_status IN ('stamping','stamped'),false) OR OLD.cfdi_uuid IS NOT NULL;
  END IF;
  IF TG_OP='DELETE' THEN
    v_org:=OLD.organization_id; v_invoice_id:=OLD.id;
    IF v_frozen AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_old_lines) li WHERE li ? 'source_quote_line_id') THEN
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
      SELECT coalesce(jsonb_agg(li ORDER BY li->>'source_quote_id',li->>'source_quote_line_id'),'[]') FROM jsonb_array_elements(v_old_lines) li WHERE li ? 'source_quote_line_id'
    ) IS DISTINCT FROM (
      SELECT coalesce(jsonb_agg(li ORDER BY li->>'source_quote_id',li->>'source_quote_line_id'),'[]') FROM jsonb_array_elements(v_new_lines) li WHERE li ? 'source_quote_line_id'
    ) THEN
      RAISE EXCEPTION 'Los cargos de una factura emitida conservan su origen y cantidades.' USING ERRCODE='23514';
    END IF;
    v_active:=public.quote_charge_invoice_active(NEW);
  END IF;
  -- All writers, including draft deletion/cancellation and recurring RPCs,
  -- serialize by the same source quote row, in deterministic UUID order.
  FOR v_id IN SELECT id FROM (
    SELECT (li->>'source_quote_id')::uuid AS id FROM jsonb_array_elements(v_old_lines || v_new_lines) li
      WHERE nullif(li->>'source_quote_id','') IS NOT NULL
    UNION SELECT v_old_quote UNION SELECT v_new_quote
    UNION SELECT b.quote_id FROM public.bookings b WHERE b.organization_id=v_org AND (
      b.id IN (v_old_booking,v_new_booking) OR EXISTS (SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id=v_invoice_id AND ib.booking_id=b.id AND ib.organization_id=v_org))
  ) ids WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM 1 FROM public.quotes q WHERE q.id=v_id AND q.organization_id=v_org FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Origen de cargo inexistente o de otra empresa.' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_new_lines) LOOP
    IF (v_line ? 'source_quote_id') IS DISTINCT FROM (v_line ? 'source_quote_line_id')
      OR (v_line->>'line_kind'='charge' AND NOT (v_line ? 'source_quote_line_id')) THEN
      RAISE EXCEPTION 'El cargo requiere su cotización y partida de origen.' USING ERRCODE='23514';
    END IF;
    IF NOT (v_line ? 'source_quote_line_id') THEN CONTINUE; END IF;
    IF current_setting('transaction_isolation') NOT IN ('read committed','read uncommitted') THEN
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
    IF (SELECT count(*) FROM jsonb_array_elements(v_new_lines) li
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
    SELECT coalesce(sum((li->>'quantity')::numeric),0) INTO v_other
      FROM public.invoices i, LATERAL jsonb_array_elements(i.line_items) li
      WHERE i.id<>v_invoice_id AND i.organization_id=v_org AND public.quote_charge_invoice_active(i)
        AND i.line_items @> jsonb_build_array(jsonb_build_object('source_quote_id',v_id))
        AND li->>'source_quote_id'=v_id::text AND li->>'source_quote_line_id'=v_line_id::text;
    IF v_active AND v_quantity+v_other>v_source_quantity THEN
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
REVOKE ALL ON FUNCTION public.enforce_invoice_quote_charges() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zzz_enforce_invoice_quote_charges BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_quote_charges();
--> statement-breakpoint

-- The manual/recurring RPC creates the invoice before its pivot rows. Check
-- association at transaction end so both paths remain atomic without widening
-- save_invoice_with_bookings privileges or replacing its established guards.
CREATE FUNCTION public.validate_invoice_quote_charge_links()
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
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_invoice.line_items) LOOP
    IF v_line ? 'source_quote_line_id' THEN
      IF NOT coalesce((v_line->>'source_quote_id')::uuid=ANY(v_quotes),false) THEN
        RAISE EXCEPTION 'El origen del cargo no está ligado a las reservas o cotización de esta factura.' USING ERRCODE='23514';
      END IF;
    ELSIF v_invoice.quote_charge_tracking_version=1 AND cardinality(v_quotes)>0 AND v_line->>'line_kind' IS DISTINCT FROM 'manual'
      AND NOT public.quote_charge_is_generated_equipment_line(v_line) THEN
      RAISE EXCEPTION 'Identifica el origen del cargo o captura explícitamente una partida manual.' USING ERRCODE='23514';
    END IF;
  END LOOP;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.validate_invoice_quote_charge_links() FROM PUBLIC, anon, authenticated, service_role;
CREATE CONSTRAINT TRIGGER invoice_quote_charge_links AFTER INSERT OR UPDATE ON public.invoices
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_quote_charge_links();
CREATE CONSTRAINT TRIGGER invoice_booking_quote_charge_links AFTER INSERT OR UPDATE OR DELETE ON public.invoice_bookings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_quote_charge_links();

--> statement-breakpoint
-- Preserve recurring RPC signature, security mode and grants; use the same
-- cancellation predicate as charge reservation (pending fiscal cancellation consumes).
CREATE OR REPLACE FUNCTION public.create_recurring_invoice(p_booking_ids uuid[], p_customer_id uuid, p_customer_name text, p_line_items jsonb, p_subtotal numeric, p_tax_rate numeric, p_tax_amount numeric, p_total numeric, p_billing_period_start date, p_billing_period_end date, p_receptor_rfc text, p_receptor_razon_social text, p_receptor_regimen_fiscal text, p_receptor_domicilio_fiscal_cp text, p_uso_cfdi text, p_moneda text DEFAULT 'MXN'::text, p_tipo_cambio numeric DEFAULT 1)
 RETURNS TABLE(invoice_id uuid, invoice_number text, already_existed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_is_service boolean := COALESCE(auth.jwt() ->> 'role', '') = 'service_role';
  v_org uuid;
  v_orgs uuid[];
  v_invoice_id uuid;
  v_invoice_number text;
  v_existing_id uuid;
  v_existing_number text;
  v_lock_key bigint;
  v_bid uuid;
  v_is_single boolean := array_length(p_booking_ids, 1) = 1;
  v_moneda text := COALESCE(NULLIF(upper(btrim(p_moneda)), ''), 'MXN');
  v_tipo_cambio numeric;
  v_uso_cfdi text := NULLIF(btrim(p_uso_cfdi), '');
  v_bad text;
  v_missing integer;
BEGIN
  IF NOT v_is_service
     AND NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'administrativo')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_booking_ids requerido';
  END IF;

  IF NOT v_is_service THEN
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_billing_period_start IS NULL OR p_billing_period_end IS NULL THEN
    RAISE EXCEPTION 'El periodo de facturación (inicio y fin) es obligatorio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_billing_period_start > p_billing_period_end THEN
    RAISE EXCEPTION 'El fin del periodo (%) no puede ser anterior al inicio (%).',
      p_billing_period_end, p_billing_period_start USING ERRCODE = 'check_violation';
  END IF;

  -- Organización derivada de las reservas reales. Una mezcla A/B, una reserva
  -- inexistente o una reserva ajena producen el mismo error genérico y nada se
  -- escribe.
  SELECT array_agg(DISTINCT b.organization_id) INTO v_orgs
    FROM public.bookings b
   WHERE b.id = ANY(p_booking_ids)
     AND (v_org IS NULL OR b.organization_id = v_org);

  SELECT count(*) INTO v_missing
    FROM unnest(p_booking_ids) AS nb(id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.bookings b
      WHERE b.id = nb.id
        AND (v_org IS NULL OR b.organization_id = v_org)
   );
  IF v_missing > 0 OR v_orgs IS NULL OR array_length(v_orgs, 1) <> 1 THEN
    RAISE EXCEPTION 'Alguna reserva del periodo recurrente no existe.' USING ERRCODE = 'check_violation';
  END IF;
  v_org := v_orgs[1];
  -- Contexto transaccional para el generador de folios (sólo dura esta transacción).
  PERFORM set_config('app.organization_id', v_org::text, true);

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE p_customer_id IS NOT NULL
     AND b.customer_id IS DISTINCT FROM p_customer_id
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % pertenece a otro cliente; no puede incluirse en esta factura recurrente.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE b.status IN ('cancelled', 'completed')
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % está cancelada o completada; no es facturable.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE COALESCE(b.recurring_billing, false) = false
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % no tiene facturación recurrente activa.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id AND b.organization_id = v_org
   WHERE p_billing_period_start < b.start_date
      OR (b.end_date IS NOT NULL AND p_billing_period_end > b.end_date)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'El periodo % – % queda fuera del rango de la reserva %.',
      p_billing_period_start, p_billing_period_end, v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_uso_cfdi IS NULL THEN
    RAISE EXCEPTION 'El cliente no tiene uso de CFDI capturado; captúralo antes de generar la factura recurrente.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_moneda = 'MXN' THEN
    v_tipo_cambio := 1;
  ELSIF public.fx_is_missing(v_moneda, p_tipo_cambio) THEN
    RAISE EXCEPTION 'Tipo de cambio inválido para facturar en % (se requiere un valor mayor a 0 y distinto de 1)', v_moneda
      USING ERRCODE = 'check_violation';
  ELSE
    v_tipo_cambio := p_tipo_cambio;
  END IF;

  FOR v_bid IN SELECT unnest(p_booking_ids) ORDER BY 1 LOOP
    v_lock_key := ('x' || substr(md5(v_bid::text), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  -- The advisory locks serialize cooperating recurring runs. An invoice for
  -- only one member of the requested group is a stale selection, not proof
  -- that every booking has been billed. Include legacy direct links too.
  SELECT i.id, i.invoice_number
    INTO v_existing_id, v_existing_number
  FROM public.invoices i
  WHERE i.organization_id = v_org
    AND i.billing_period_start = p_billing_period_start
    AND i.billing_period_end = p_billing_period_end
    AND public.quote_charge_invoice_active(i)
    AND (
      i.booking_id = ANY(p_booking_ids)
      OR EXISTS (
        SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = i.id
          AND ib.booking_id = ANY(p_booking_ids)
          AND COALESCE(ib.organization_id, v_org) = v_org
      )
    )
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_booking_ids) AS requested(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = v_existing_id
          AND ib.booking_id = requested.id
          AND COALESCE(ib.organization_id, v_org) = v_org
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = v_existing_id
          AND i.organization_id = v_org
          AND i.booking_id = requested.id
      )
    ) THEN
      RAISE EXCEPTION 'El grupo de reservas cambió: una parte del periodo ya tiene factura. Actualiza la vista previa antes de continuar.'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.bookings SET last_billed_date = p_billing_period_end
     WHERE id = ANY(p_booking_ids) AND organization_id = v_org;
    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT public.next_draft_invoice_number() INTO v_invoice_number;
  IF v_invoice_number IS NULL THEN
    v_invoice_number := 'FAC-AUTO-' || extract(epoch FROM now())::bigint::text;
  END IF;

  -- A unique violation after the locks is a real collision (for example, an
  -- independent manual writer). Never reinterpret it as group success.
  INSERT INTO public.invoices (
      invoice_number, booking_id, customer_id, customer_name, line_items,
      subtotal, tax_rate, tax_amount, total, status, due_date,
      billing_period_start, billing_period_end,
      receptor_rfc, receptor_razon_social, receptor_regimen_fiscal,
      receptor_domicilio_fiscal_cp, uso_cfdi,
      forma_pago, metodo_pago, moneda, tipo_cambio, organization_id
  ) VALUES (
      v_invoice_number,
      CASE WHEN v_is_single THEN p_booking_ids[1] ELSE NULL END,
      p_customer_id, p_customer_name, p_line_items,
      p_subtotal, p_tax_rate, p_tax_amount, p_total, 'draft', p_billing_period_end,
      p_billing_period_start, p_billing_period_end,
      p_receptor_rfc, p_receptor_razon_social, p_receptor_regimen_fiscal,
      p_receptor_domicilio_fiscal_cp, v_uso_cfdi,
      '99', 'PPD', v_moneda, v_tipo_cambio, v_org
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_bookings (invoice_id, booking_id, organization_id)
  SELECT v_invoice_id, unnest(p_booking_ids), v_org;

  UPDATE public.bookings SET last_billed_date = p_billing_period_end
   WHERE id = ANY(p_booking_ids) AND organization_id = v_org;

  invoice_id := v_invoice_id;
  invoice_number := v_invoice_number;
  already_existed := false;
  RETURN NEXT;
END;
$function$;

--> statement-breakpoint
CREATE FUNCTION public.lock_invoice_quote_charge_link_change()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_ids uuid[];
BEGIN
  v_ids:=ARRAY[OLD.invoice_id];
  IF TG_OP='UPDATE' THEN v_ids:=array_append(v_ids,NEW.invoice_id); END IF;
  FOR v_id IN SELECT DISTINCT unnest(v_ids) ORDER BY 1 LOOP
    BEGIN
      PERFORM 1 FROM public.invoices WHERE id=v_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'La factura está siendo editada. Reintenta el cambio de vínculos.' USING ERRCODE='55P03';
    END;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lock_invoice_quote_charge_link_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_lock_invoice_quote_charge_link_change BEFORE UPDATE OR DELETE ON public.invoice_bookings
FOR EACH ROW EXECUTE FUNCTION public.lock_invoice_quote_charge_link_change();

CREATE FUNCTION public.guard_booking_quote_charge_origin()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NEW.quote_id IS NOT DISTINCT FROM OLD.quote_id THEN RETURN NEW; END IF;
  FOR v_id IN SELECT i.id FROM public.invoices i WHERE i.organization_id=OLD.organization_id
    AND (i.booking_id=OLD.id OR EXISTS (SELECT 1 FROM public.invoice_bookings ib WHERE ib.invoice_id=i.id AND ib.booking_id=OLD.id))
    ORDER BY i.id LOOP
    BEGIN PERFORM 1 FROM public.invoices WHERE id=v_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'Una factura está siendo editada. Reintenta el cambio de cotización.' USING ERRCODE='55P03';
    END;
    IF EXISTS(SELECT 1 FROM public.invoices i,LATERAL jsonb_array_elements(i.line_items) li
      WHERE i.id=v_id AND li ? 'source_quote_line_id') THEN
      RAISE EXCEPTION 'Una reserva con cargos facturados conserva su cotización de origen.' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_booking_quote_charge_origin() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zzz_guard_booking_quote_charge_origin BEFORE UPDATE OF quote_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_booking_quote_charge_origin();
