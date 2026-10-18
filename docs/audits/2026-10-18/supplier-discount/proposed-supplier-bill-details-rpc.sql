-- PROPOSAL ONLY. Outside automatic migration directories. Never run against a
-- published database without specific approval and target/schema verification.
-- Replaces the blocked isolated GRANT proposal. It does not grant table UPDATE.
BEGIN;
CREATE OR REPLACE FUNCTION public.update_supplier_bill_details(p_bill_id uuid, p_patch jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
SET app.cxp_rpc TO 'off'
SET app.cxp_recalc TO 'off'
SET app.audit_revert TO 'off'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_org uuid;
  v_old public.supplier_bills%ROWTYPE;
  v_new public.supplier_bills%ROWTYPE;
  v_key text;
  v_value numeric;
  v_expected numeric;
  v_money_changed boolean;
  v_identity_changed boolean;
  v_allowed constant text[] := ARRAY[
    'supplier_id','category','description','issue_date','due_date',
    'coverage_start','coverage_end','currency','exchange_rate','subtotal',
    'discount','tax_amount','retention_iva','retention_isr','total',
    'cfdi_uuid','payment_method_sat','cfdi_xml_url'
  ];
  v_amounts constant text[] := ARRAY[
    'subtotal','discount','tax_amount','retention_iva','retention_isr','total'
  ];
BEGIN
  -- Never infer caller authorization from current_user inside SECURITY DEFINER.
  IF v_actor IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=v_actor AND p.is_active IS TRUE)
     OR NOT (public.has_role(v_actor,'admin'::public.app_role)
             OR public.has_role(v_actor,'administrativo'::public.app_role)) THEN
    RAISE EXCEPTION 'No autorizado para editar facturas de proveedor' USING ERRCODE='42501';
  END IF;
  v_org := public.current_internal_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Se requiere membresia interna en una empresa activa' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch='{}'::jsonb THEN
    RAISE EXCEPTION 'El patch debe ser un objeto no vacio' USING ERRCODE='22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key=ANY(v_allowed)) THEN
      RAISE EXCEPTION 'El patch contiene campos no permitidos' USING ERRCODE='22023';
    END IF;
    IF v_key=ANY(v_amounts) OR v_key='exchange_rate' THEN
      IF jsonb_typeof(p_patch->v_key) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Los importes y el tipo de cambio deben ser numeros JSON' USING ERRCODE='22023';
      END IF;
      v_value := (p_patch->>v_key)::numeric;
      IF v_value<0 OR (v_key='exchange_rate' AND v_value<=0) THEN
        RAISE EXCEPTION 'Importe o tipo de cambio fuera de rango' USING ERRCODE='23514';
      END IF;
      IF v_value IS DISTINCT FROM round(v_value,CASE WHEN v_key='exchange_rate' THEN 6 ELSE 2 END) THEN
        RAISE EXCEPTION 'Precision monetaria no permitida' USING ERRCODE='22023';
      END IF;
    ELSIF jsonb_typeof(p_patch->v_key) NOT IN ('string','null') THEN
      RAISE EXCEPTION 'Tipo de dato no permitido en el patch' USING ERRCODE='22023';
    ELSIF v_key IN ('supplier_id','category','issue_date','currency') AND p_patch->v_key='null'::jsonb THEN
      RAISE EXCEPTION 'Un campo requerido no puede ser nulo' USING ERRCODE='22023';
    END IF;
  END LOOP;

  -- Explicit scope is mandatory: the definer may bypass RLS. The parent row
  -- lock also serializes the existing payment writers that lock the same bill.
  SELECT b.* INTO v_old FROM public.supplier_bills b
   WHERE b.id=p_bill_id AND b.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no disponible en la empresa autorizada' USING ERRCODE='42501';
  END IF;
  BEGIN
    SELECT * INTO v_new FROM jsonb_populate_record(v_old,p_patch);
  EXCEPTION WHEN data_exception THEN
    RAISE EXCEPTION 'Valores invalidos en el patch de factura' USING ERRCODE='22023';
  END;
  v_money_changed := ROW(v_new.subtotal,v_new.discount,v_new.tax_amount,v_new.retention_iva,
    v_new.retention_isr,v_new.total,v_new.currency,v_new.exchange_rate)
    IS DISTINCT FROM ROW(v_old.subtotal,v_old.discount,v_old.tax_amount,v_old.retention_iva,
    v_old.retention_isr,v_old.total,v_old.currency,v_old.exchange_rate);
  v_identity_changed := ROW(v_new.supplier_id,v_new.cfdi_uuid,v_new.issue_date,
    v_new.payment_method_sat,v_new.cfdi_xml_url)
    IS DISTINCT FROM ROW(v_old.supplier_id,v_old.cfdi_uuid,v_old.issue_date,
    v_old.payment_method_sat,v_old.cfdi_xml_url);

  IF v_money_changed OR v_identity_changed THEN
    IF v_old.approval_status::text='approved'
       OR v_old.status::text IN ('paid','partial','cancelled')
       OR EXISTS (SELECT 1 FROM public.supplier_payments p WHERE p.bill_id=v_old.id) THEN
      RAISE EXCEPTION 'La factura requiere revertir pagos o reaprobacion antes de editar importes o identidad fiscal'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF v_new.supplier_id IS DISTINCT FROM v_old.supplier_id AND v_new.supplier_id IS NOT NULL THEN
    PERFORM 1 FROM public.suppliers s
     WHERE s.id=v_new.supplier_id AND s.organization_id=v_org AND s.deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Proveedor no disponible en la empresa autorizada' USING ERRCODE='42501';
    END IF;
  END IF;
  IF v_money_changed THEN
    IF v_new.discount IS DISTINCT FROM v_old.discount AND NOT (p_patch ? 'total') THEN
      RAISE EXCEPTION 'Cambiar descuento requiere total explicito' USING ERRCODE='22023';
    END IF;
    IF v_new.subtotal IS NULL OR v_new.discount IS NULL OR v_new.tax_amount IS NULL
       OR v_new.retention_iva IS NULL OR v_new.retention_isr IS NULL OR v_new.total IS NULL
       OR v_new.exchange_rate IS NULL OR v_new.currency IS NULL
       OR v_new.subtotal::text IN ('NaN','Infinity','-Infinity')
       OR v_new.discount::text IN ('NaN','Infinity','-Infinity')
       OR v_new.tax_amount::text IN ('NaN','Infinity','-Infinity')
       OR v_new.retention_iva::text IN ('NaN','Infinity','-Infinity')
       OR v_new.retention_isr::text IN ('NaN','Infinity','-Infinity')
       OR v_new.total::text IN ('NaN','Infinity','-Infinity')
       OR v_new.exchange_rate::text IN ('NaN','Infinity','-Infinity')
       OR v_new.subtotal<0 OR v_new.discount<0 OR v_new.tax_amount<0
       OR v_new.retention_iva<0 OR v_new.retention_isr<0 OR v_new.total<0
       OR v_new.discount>v_new.subtotal OR v_new.exchange_rate<=0
       OR v_new.currency NOT IN ('MXN','USD')
       OR public.fx_is_missing(v_new.currency,v_new.exchange_rate) THEN
      RAISE EXCEPTION 'Importes, descuento o tipo de cambio invalidos' USING ERRCODE='23514';
    END IF;
    v_expected := round(v_new.subtotal-v_new.discount+v_new.tax_amount-v_new.retention_iva-v_new.retention_isr,2);
    IF v_expected<0 OR v_new.total IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'El total no coincide con subtotal, descuento, impuestos y retenciones' USING ERRCODE='23514';
    END IF;
  END IF;

  -- Static assignments: never spread caller keys into SQL. Existing table
  -- constraints/triggers still execute; protected fields are never assigned.
  UPDATE public.supplier_bills b SET
    supplier_id=v_new.supplier_id,category=v_new.category,description=v_new.description,
    issue_date=v_new.issue_date,due_date=v_new.due_date,
    coverage_start=v_new.coverage_start,coverage_end=v_new.coverage_end,
    currency=v_new.currency,exchange_rate=v_new.exchange_rate,subtotal=v_new.subtotal,
    discount=v_new.discount,tax_amount=v_new.tax_amount,
    retention_iva=v_new.retention_iva,retention_isr=v_new.retention_isr,total=v_new.total,
    cfdi_uuid=v_new.cfdi_uuid,payment_method_sat=v_new.payment_method_sat,cfdi_xml_url=v_new.cfdi_xml_url
   WHERE b.id=v_old.id AND b.organization_id=v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no disponible en la empresa autorizada' USING ERRCODE='42501';
  END IF;
  RETURN v_old.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_supplier_bill_details(uuid,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_supplier_bill_details(uuid,jsonb) TO authenticated;
COMMIT;
