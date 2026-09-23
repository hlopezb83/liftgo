-- Every organization's first internal quote is COT-0001. Existing counters
-- keep their current next_value, so historical folios are never reused.
CREATE OR REPLACE FUNCTION public.next_quote_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NOT public.is_staff() THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
    END IF;
    v_org := public.current_internal_organization_id();
    IF v_org IS NULL
       OR NOT public.is_internal_member(v_uid)
       OR public.resolve_organization_context() IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
    END IF;
  END IF;

  RETURN 'COT-' || lpad(
    public.next_organization_document_counter('quote', 1)::text,
    4,
    '0'
  );
END;
$function$;

-- Empresa Prueba has only two internal test quotes, initially assigned
-- COT-0101/0102. Repair them without changing IDs or any other company.
-- The exact-state guard prevents a future deployment from renumbering
-- unrelated records if this organization's data has since changed.
DO $repair_empresa_prueba_quotes$
DECLARE
  v_org constant uuid := 'fc2c10e3-278b-4899-8aa1-f802752f1c38';
  v_first constant uuid := 'eec230b8-2e05-41a1-84c0-3ea42c76393a';
  v_second constant uuid := '1e733614-53d9-4079-af4a-c8f81272d78b';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.quotes WHERE id = v_first AND organization_id = v_org AND quote_number = 'COT-0001')
     AND EXISTS (SELECT 1 FROM public.quotes WHERE id = v_second AND organization_id = v_org AND quote_number = 'COT-0002') THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.quotes WHERE organization_id = v_org AND is_e2e IS NOT TRUE) <> 2
     OR NOT EXISTS (SELECT 1 FROM public.quotes WHERE id = v_first AND organization_id = v_org AND quote_number = 'COT-0101')
     OR NOT EXISTS (SELECT 1 FROM public.quotes WHERE id = v_second AND organization_id = v_org AND quote_number = 'COT-0102')
     OR EXISTS (SELECT 1 FROM public.quotes WHERE organization_id = v_org AND quote_number IN ('COT-0001', 'COT-0002'))
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_document_counters
       WHERE organization_id = v_org AND document_type = 'quote' AND next_value = 103
     ) THEN
    RAISE EXCEPTION 'Empresa Prueba quote folios changed; review before renumbering';
  END IF;

  UPDATE public.quotes
     SET quote_number = CASE id WHEN v_first THEN 'COT-0001' ELSE 'COT-0002' END
   WHERE organization_id = v_org AND id IN (v_first, v_second);

  UPDATE public.organization_document_counters
     SET next_value = 3, updated_at = now()
   WHERE organization_id = v_org AND document_type = 'quote';
END;
$repair_empresa_prueba_quotes$;

