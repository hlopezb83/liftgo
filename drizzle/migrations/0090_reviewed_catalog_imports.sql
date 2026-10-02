-- Revisión de nuevas incorporaciones desde Org 1. No ejecuta importaciones,
-- no modifica tablas locales ni asigna versiones legales a empresas.
CREATE TABLE public.platform_catalog_import_source (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  source_organization_id uuid NOT NULL REFERENCES public.organizations(id)
);
INSERT INTO public.platform_catalog_import_source (source_organization_id)
SELECT id FROM public.organizations ORDER BY created_at, id LIMIT 1;

CREATE TABLE public.platform_catalog_imports (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('model','part','template')),
  source_organization_id uuid NOT NULL,
  source_record_id uuid NOT NULL,
  name text NOT NULL,
  target_catalog_id uuid NOT NULL,
  target_version_id uuid,
  resolution text NOT NULL CHECK (resolution IN ('create','reuse')),
  source_checksum text NOT NULL CHECK (source_checksum ~ '^[0-9a-f]{64}$'),
  review_fingerprint text NOT NULL CHECK (review_fingerprint ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 500),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, source_organization_id, source_record_id)
);
ALTER TABLE public.platform_catalog_import_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_catalog_import_source FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_catalog_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_catalog_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY "catalog source denies client access" ON public.platform_catalog_import_source AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY "catalog import denies client access" ON public.platform_catalog_imports AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.platform_catalog_import_source, public.platform_catalog_imports FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.platform_catalog_import_source TO service_role;
GRANT SELECT ON public.platform_catalog_imports TO service_role;

CREATE FUNCTION public.platform_catalog_legal_content(p_content jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object('body_text',p_content->'body_text','intro_text',p_content->'intro_text','pagare_text',p_content->'pagare_text',
    'declarations_landlord',coalesce(nullif(p_content->'declarations_landlord','null'::jsonb),'[]'::jsonb),
    'declarations_tenant',coalesce(nullif(p_content->'declarations_tenant','null'::jsonb),'[]'::jsonb),
    'clauses',coalesce(nullif(p_content->'clauses','null'::jsonb),'[]'::jsonb),
    'checklist_sections',coalesce(nullif(p_content->'checklist_sections','null'::jsonb),'[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION public.platform_catalog_legal_content(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_catalog_import_candidate(p_kind text, p_source_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := (SELECT source_organization_id FROM public.platform_catalog_import_source);
  v_source jsonb; v_match jsonb; v_link uuid; v_status text := 'new';
  v_title text; v_issue text; v_matches integer := 0; v_checksum text;
BEGIN
  IF p_kind='model' THEN
    SELECT jsonb_build_object('manufacturer',btrim(manufacturer),'model',btrim(model),
      'capacity_kg',default_capacity_kg,'mast_height_m',default_mast_height_m,'fuel_type',nullif(btrim(default_fuel_type),'')),
      catalog_model_id, btrim(manufacturer)||' · '||btrim(model),
      CASE WHEN NOT is_active THEN 'El modelo de origen está inactivo.'
        WHEN btrim(manufacturer)='' OR btrim(model)='' THEN 'Completa fabricante y modelo en el origen.'
        WHEN default_capacity_kg<=0 OR default_mast_height_m<=0 THEN 'La capacidad y la altura deben ser mayores que cero.' END
    INTO v_source,v_link,v_title,v_issue FROM public.equipment_models
    WHERE id=p_source_id AND organization_id=v_org AND NOT is_e2e;
    SELECT count(*) INTO v_matches FROM public.equipment_model_catalog c
    WHERE lower(btrim(c.manufacturer))=lower(v_source->>'manufacturer') AND lower(btrim(c.model))=lower(v_source->>'model');
    SELECT jsonb_build_object('id',c.id,'name',c.manufacturer||' · '||c.model,'is_active',c.is_active,
      'data',jsonb_build_object('manufacturer',c.manufacturer,'model',c.model,'capacity_kg',c.capacity_kg,
        'mast_height_m',c.mast_height_m,'fuel_type',c.fuel_type)) INTO v_match
    FROM public.equipment_model_catalog c
    WHERE c.id=v_link OR (lower(btrim(c.manufacturer))=lower(v_source->>'manufacturer') AND lower(btrim(c.model))=lower(v_source->>'model'))
    ORDER BY (c.id=v_link) DESC NULLS LAST,c.id LIMIT 1;
    IF EXISTS(SELECT 1 FROM public.equipment_model_catalog WHERE source_organization_id=v_org AND source_record_id=p_source_id) THEN
      v_status := 'imported';
    END IF;
  ELSIF p_kind='part' THEN
    SELECT jsonb_build_object('sku',upper(btrim(sku)),'name',btrim(name),'category',btrim(category),'unit_of_measure','pieza'),
      catalog_part_id, coalesce(upper(btrim(sku)),'Sin SKU')||' · '||btrim(name),
      CASE WHEN NOT is_active THEN 'La refacción de origen está inactiva.'
        WHEN btrim(name)='' THEN 'Completa el nombre en la empresa de origen.'
        WHEN nullif(btrim(sku),'') IS NULL THEN 'Completa el SKU en la empresa de origen.' END
    INTO v_source,v_link,v_title,v_issue FROM public.parts_inventory WHERE id=p_source_id AND organization_id=v_org;
    SELECT count(*) INTO v_matches FROM public.parts_catalog WHERE upper(btrim(sku))=v_source->>'sku';
    SELECT jsonb_build_object('id',c.id,'name',c.sku||' · '||c.name,'is_active',c.is_active,
      'data',jsonb_build_object('sku',c.sku,'name',c.name,'category',c.category,'unit_of_measure',c.unit_of_measure)) INTO v_match
    FROM public.parts_catalog c WHERE c.id=v_link OR upper(btrim(c.sku))=v_source->>'sku'
    ORDER BY (c.id=v_link) DESC NULLS LAST,c.id LIMIT 1;
    IF EXISTS(SELECT 1 FROM public.parts_catalog WHERE source_organization_id=v_org AND source_record_id=p_source_id) THEN
      v_status := 'imported';
    END IF;
  ELSIF p_kind='template' THEN
    SELECT jsonb_build_object('name',btrim(name),'content',jsonb_build_object('body_text',body_text,'intro_text',intro_text,
      'declarations_landlord',coalesce(declarations_landlord,'[]'::jsonb),
      'declarations_tenant',coalesce(declarations_tenant,'[]'::jsonb),'clauses',coalesce(clauses,'[]'::jsonb),
      'checklist_sections',coalesce(checklist_sections,'[]'::jsonb),'pagare_text',pagare_text)),
      global_template_version_id,btrim(name) INTO v_source,v_link,v_title
    FROM public.contract_templates WHERE id=p_source_id AND organization_id=v_org;
    IF v_source IS NOT NULL THEN
      BEGIN PERFORM public.validate_legal_template_content(v_source->'content');
      EXCEPTION WHEN invalid_parameter_value THEN v_issue := 'El machote de origen requiere corregir su contenido antes de incorporarlo.'; END;
    END IF;
    SELECT count(*) INTO v_matches FROM public.legal_template_definitions d
    JOIN public.legal_template_versions v ON v.id=d.current_version_id
    WHERE d.document_type='rental_contract' AND (lower(btrim(d.name))=lower(v_title) OR public.platform_catalog_legal_content(v.content)=v_source->'content');
    SELECT jsonb_build_object('id',d.id,'name',d.name,'is_active',d.is_active,'version_id',v.id,
      'data',jsonb_build_object('name',d.name,'content',public.platform_catalog_legal_content(v.content))) INTO v_match
    FROM public.legal_template_definitions d JOIN public.legal_template_versions v ON v.id=d.current_version_id
    WHERE d.document_type='rental_contract' AND (v.id=v_link OR lower(btrim(d.name))=lower(v_title) OR public.platform_catalog_legal_content(v.content)=v_source->'content')
    ORDER BY (v.id=v_link) DESC NULLS LAST,d.id LIMIT 1;
    IF v_match IS NOT NULL AND v_match#>'{data,content}' IS DISTINCT FROM v_source->'content' THEN
      v_issue := 'Existe un machote con el mismo nombre y otro contenido. Revisa sus versiones desde Machotes legales.';
      v_status := 'conflict';
    END IF;
    IF EXISTS(SELECT 1 FROM public.legal_template_definitions WHERE source_organization_id=v_org AND source_record_id=p_source_id) THEN
      v_status := 'imported';
    END IF;
  ELSE RAISE EXCEPTION 'Tipo de maestro inválido' USING ERRCODE='22023'; END IF;
  IF v_source IS NULL THEN RAISE EXCEPTION 'Origen no encontrado en Org 1' USING ERRCODE='P0002'; END IF;
  IF length(v_source::text)>200000 THEN v_issue := 'El contenido supera el límite de revisión (200 KB).'; END IF;
  IF v_status<>'imported' AND v_link IS NULL THEN
    IF v_issue IS NOT NULL AND v_status<>'conflict' THEN v_status := 'invalid';
    ELSIF v_matches>1 THEN v_status := 'conflict'; v_issue := 'Hay varias coincidencias. Resuelve los duplicados del catálogo global.';
    ELSIF v_match IS NOT NULL AND v_status<>'conflict' THEN
      IF NOT (v_match->>'is_active')::boolean THEN
        v_status := 'conflict'; v_issue := 'El maestro coincidente está inactivo. Revísalo en el catálogo global.';
      ELSE v_status := 'duplicate'; END IF;
    END IF;
  END IF;
  IF v_link IS NOT NULL OR EXISTS(SELECT 1 FROM public.platform_catalog_imports WHERE kind=p_kind AND source_organization_id=v_org AND source_record_id=p_source_id) THEN
    v_status := 'imported';
  END IF;
  v_checksum := encode(extensions.digest(v_source::text,'sha256'),'hex');
  RETURN jsonb_build_object('kind',p_kind,'source_id',p_source_id,'title',v_title,'status',v_status,'issue',v_issue,
    'source',v_source,'match',v_match,'source_checksum',v_checksum,
    'fingerprint',encode(extensions.digest(jsonb_build_object('org',v_org,'source',v_source,'match',v_match,'status',v_status)::text,'sha256'),'hex'));
END $$;
REVOKE ALL ON FUNCTION public.platform_catalog_import_candidate(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.platform_list_catalog_import_candidates(p_actor uuid,p_kind text,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF p_kind IS NULL OR p_kind NOT IN ('model','part','template') OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Tipo o paginación inválidos' USING ERRCODE='22023'; END IF;
  WITH ids AS (
    SELECT id FROM public.equipment_models WHERE p_kind='model' AND organization_id=(SELECT source_organization_id FROM public.platform_catalog_import_source) AND NOT is_e2e
    UNION ALL SELECT id FROM public.parts_inventory WHERE p_kind='part' AND organization_id=(SELECT source_organization_id FROM public.platform_catalog_import_source)
    UNION ALL SELECT id FROM public.contract_templates WHERE p_kind='template' AND organization_id=(SELECT source_organization_id FROM public.platform_catalog_import_source)
  ), candidates AS MATERIALIZED (SELECT public.platform_catalog_import_candidate(p_kind,id) AS item FROM ids),
  page AS (SELECT item FROM candidates ORDER BY item->>'title',item->>'source_id' LIMIT 20 OFFSET p_offset)
  SELECT jsonb_build_object('source_organization',(SELECT jsonb_build_object('id',o.id,'name',o.name,'is_active',o.is_active)
      FROM public.platform_catalog_import_source s JOIN public.organizations o ON o.id=s.source_organization_id),
    'total',(SELECT count(*) FROM candidates),
    'pending',(SELECT count(*) FROM candidates WHERE item->>'status' IN ('new','duplicate')),
    'items',coalesce((SELECT jsonb_agg(item-'source'-'match'-'source_checksum'-'fingerprint' ORDER BY item->>'title',item->>'source_id') FROM page),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END $$;

CREATE FUNCTION public.platform_get_catalog_import_preview(p_actor uuid,p_kind text,p_source_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  RETURN public.platform_catalog_import_candidate(p_kind,p_source_id);
END $$;

CREATE FUNCTION public.platform_import_catalog_candidate(p_actor uuid,p_request_id uuid,p_kind text,p_source_id uuid,
  p_fingerprint text,p_resolution text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := (SELECT source_organization_id FROM public.platform_catalog_import_source);
  v_receipt public.platform_catalog_imports%ROWTYPE;
  v_candidate jsonb; v_source jsonb; v_target uuid; v_version uuid; v_locked uuid;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF p_request_id IS NULL OR p_source_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('model','part','template')
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_resolution IS NULL OR p_resolution NOT IN ('create','reuse')
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500
    OR p_reason ~* 'sk_(test|live|proj)[_-][A-Za-z0-9]|sb_secret_|Bearer[[:space:]]+[^[:space:]]+|eyJ[A-Za-z0-9_-]{10,}\.' THEN
    RAISE EXCEPTION 'Revisión o motivo inválidos' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,90));
  SELECT * INTO v_receipt FROM public.platform_catalog_imports WHERE id=p_request_id;
  IF FOUND THEN
    IF (v_receipt.kind,v_receipt.source_record_id,v_receipt.review_fingerprint,v_receipt.resolution,v_receipt.reason)
      IS DISTINCT FROM (p_kind,p_source_id,p_fingerprint,p_resolution,btrim(p_reason)) THEN
      RAISE EXCEPTION 'La solicitud ya se registró con otra revisión' USING ERRCODE='23505'; END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(p_kind||p_source_id::text,90));
    IF p_kind='model' THEN SELECT id INTO v_locked FROM public.equipment_models WHERE id=p_source_id AND organization_id=v_org AND NOT is_e2e FOR UPDATE;
    ELSIF p_kind='part' THEN SELECT id INTO v_locked FROM public.parts_inventory WHERE id=p_source_id AND organization_id=v_org FOR UPDATE;
    ELSE SELECT id INTO v_locked FROM public.contract_templates WHERE id=p_source_id AND organization_id=v_org FOR UPDATE; END IF;
    IF v_locked IS NULL THEN RAISE EXCEPTION 'Origen no encontrado en Org 1' USING ERRCODE='P0002'; END IF;
    v_candidate := public.platform_catalog_import_candidate(p_kind,p_source_id);
    -- Importaciones distintas con la misma identidad se serializan también.
    -- Los índices únicos siguen protegiendo frente a escritores externos.
    IF p_kind='model' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('model',lower(v_candidate#>>'{source,manufacturer}'),lower(v_candidate#>>'{source,model}'))::text,91));
    ELSIF p_kind='part' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('part'||coalesce(v_candidate#>>'{source,sku}',''),91));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended('template'||lower(v_candidate#>>'{source,name}'),91));
      PERFORM pg_advisory_xact_lock(hashtextextended((v_candidate#>'{source,content}')::text,92));
    END IF;
    v_candidate := public.platform_catalog_import_candidate(p_kind,p_source_id);
    v_target := (v_candidate#>>'{match,id}')::uuid;
    IF v_target IS NOT NULL THEN
      IF p_kind='model' THEN PERFORM 1 FROM public.equipment_model_catalog WHERE id=v_target FOR UPDATE;
      ELSIF p_kind='part' THEN PERFORM 1 FROM public.parts_catalog WHERE id=v_target FOR UPDATE;
      ELSE PERFORM 1 FROM public.legal_template_definitions WHERE id=v_target FOR UPDATE; END IF;
      v_candidate := public.platform_catalog_import_candidate(p_kind,p_source_id);
    END IF;
    IF v_candidate->>'fingerprint' IS DISTINCT FROM p_fingerprint THEN
      RAISE EXCEPTION 'Los datos cambiaron desde la revisión. Actualiza la vista previa.' USING ERRCODE='23505'; END IF;
    IF (p_resolution='create' AND v_candidate->>'status'<>'new') OR (p_resolution='reuse' AND v_candidate->>'status'<>'duplicate') THEN
      RAISE EXCEPTION 'El estado del maestro requiere otra revisión' USING ERRCODE='23505'; END IF;
    PERFORM public.assert_platform_operator(p_actor);
    PERFORM set_config('app.platform_request_id',p_request_id::text,true);
    v_source := v_candidate->'source';
    IF p_resolution='create' THEN
      IF p_kind='model' THEN
        INSERT INTO public.equipment_model_catalog (manufacturer,model,capacity_kg,mast_height_m,fuel_type,source_organization_id,source_record_id,created_by,updated_by)
        VALUES(v_source->>'manufacturer',v_source->>'model',(v_source->>'capacity_kg')::numeric,(v_source->>'mast_height_m')::numeric,
          v_source->>'fuel_type',v_org,p_source_id,p_actor,p_actor) RETURNING id INTO v_target;
      ELSIF p_kind='part' THEN
        INSERT INTO public.parts_catalog (sku,name,category,unit_of_measure,source_organization_id,source_record_id,created_by,updated_by)
        VALUES(v_source->>'sku',v_source->>'name',v_source->>'category','pieza',v_org,p_source_id,p_actor,p_actor) RETURNING id INTO v_target;
      ELSE
        INSERT INTO public.legal_template_definitions (template_key,document_type,name,description,source_organization_id,source_record_id,created_by,updated_by)
        VALUES('rental_contract_'||replace(p_source_id::text,'-',''),'rental_contract',v_source->>'name','Incorporación revisada desde Org 1',v_org,p_source_id,p_actor,p_actor) RETURNING id INTO v_target;
        SELECT version_id INTO v_version FROM public.platform_publish_legal_template_version(p_actor,v_target,v_source->'content',btrim(p_reason),false);
      END IF;
    ELSE v_version := (v_candidate#>>'{match,version_id}')::uuid; END IF;
    INSERT INTO public.platform_catalog_imports (id,kind,source_organization_id,source_record_id,name,target_catalog_id,target_version_id,
      resolution,source_checksum,review_fingerprint,reason,created_by)
    VALUES(p_request_id,p_kind,v_org,p_source_id,v_candidate->>'title',v_target,v_version,p_resolution,
      v_candidate->>'source_checksum',p_fingerprint,btrim(p_reason),p_actor) RETURNING * INTO v_receipt;
  END IF;
  RETURN jsonb_build_object('id',v_receipt.id,'kind',v_receipt.kind,'source_id',v_receipt.source_record_id,
    'target_id',v_receipt.target_catalog_id,'version_id',v_receipt.target_version_id,'resolution',v_receipt.resolution);
END $$;

-- Bitácora del recibo, incluso cuando se reutiliza un maestro sin modificarlo.
ALTER TABLE public.platform_audit_events DROP CONSTRAINT platform_audit_events_target_type_check;
ALTER TABLE public.platform_audit_events ADD CONSTRAINT platform_audit_events_target_type_check CHECK (target_type IN
  ('organizations','equipment_model_catalog','parts_catalog','parts_catalog_equipment_models','legal_template_definitions',
   'legal_template_versions','organization_legal_template_assignments','platform_operators','platform_catalog_imports'));
CREATE FUNCTION public.record_platform_catalog_import_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.platform_audit_events (actor_id,actor_name,target_type,target_id,action,reason,request_id,changed_fields,new_state)
  VALUES(NEW.created_by,(SELECT left(full_name,200) FROM public.profiles WHERE user_id=NEW.created_by),
    'platform_catalog_imports',NEW.id,'INSERT',NEW.reason,NEW.id,
    ARRAY['kind','source_organization_id','source_record_id','target_catalog_id','target_version_id','resolution','source_checksum'],
    jsonb_build_object('name',NEW.name,'kind',NEW.kind,'source_organization_id',NEW.source_organization_id,
      'source_record_id',NEW.source_record_id,'target_catalog_id',NEW.target_catalog_id,'target_version_id',NEW.target_version_id,
      'resolution',NEW.resolution,'source_checksum',NEW.source_checksum));
  RETURN NEW;
END $$;
CREATE TRIGGER platform_catalog_import_audit AFTER INSERT ON public.platform_catalog_imports
FOR EACH ROW EXECUTE FUNCTION public.record_platform_catalog_import_event();
CREATE TRIGGER platform_catalog_import_immutable BEFORE UPDATE OR DELETE ON public.platform_catalog_imports
FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_audit_mutation();
CREATE TRIGGER platform_catalog_import_no_truncate BEFORE TRUNCATE ON public.platform_catalog_imports
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_platform_audit_mutation();
REVOKE ALL ON FUNCTION public.record_platform_catalog_import_event() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_list_catalog_import_candidates(uuid,text,integer),
  public.platform_get_catalog_import_preview(uuid,text,uuid),
  public.platform_import_catalog_candidate(uuid,uuid,text,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_catalog_import_candidates(uuid,text,integer),
  public.platform_get_catalog_import_preview(uuid,text,uuid),
  public.platform_import_catalog_candidate(uuid,uuid,text,uuid,text,text,text) TO service_role;

-- Amplía únicamente el tipo admitido por el filtro existente de bitácora.
CREATE OR REPLACE FUNCTION public.platform_list_audit_events(p_actor uuid,p_organization_id uuid DEFAULT NULL,
  p_target_type text DEFAULT NULL,p_before_id bigint DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb; v_more boolean;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_before_id IS NOT NULL AND p_before_id<=0) THEN
    RAISE EXCEPTION 'Paginación inválida' USING ERRCODE='22023'; END IF;
  IF p_target_type IS NOT NULL AND p_target_type NOT IN ('organizations','equipment_model_catalog','parts_catalog',
    'parts_catalog_equipment_models','legal_template_definitions','legal_template_versions','organization_legal_template_assignments',
    'platform_operators','platform_catalog_imports') THEN RAISE EXCEPTION 'Tipo de evento inválido' USING ERRCODE='22023'; END IF;
  IF p_organization_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE='P0002'; END IF;
  WITH page AS (SELECT e.*,row_number() OVER(ORDER BY e.id DESC) AS position FROM public.platform_audit_events e
    WHERE (p_organization_id IS NULL OR e.organization_id=p_organization_id) AND (p_target_type IS NULL OR e.target_type=p_target_type)
      AND (p_before_id IS NULL OR e.id<p_before_id) ORDER BY e.id DESC LIMIT p_limit+1)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'occurred_at',occurred_at,'actor_id',actor_id,'actor_name',actor_name,
    'organization_id',organization_id,'target_type',target_type,'target_id',target_id,'action',action,'reason',reason,'request_id',request_id,
    'changed_fields',changed_fields,'old_state',old_state,'new_state',new_state,'is_legacy',legacy_audit_id IS NOT NULL)
    ORDER BY id DESC) FILTER(WHERE position<=p_limit),'[]'::jsonb),coalesce(bool_or(position>p_limit),false) INTO v_rows,v_more FROM page;
  RETURN jsonb_build_object('events',v_rows,'has_more',v_more);
END $$;
REVOKE ALL ON FUNCTION public.platform_list_audit_events(uuid,uuid,text,bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_audit_events(uuid,uuid,text,bigint,integer) TO service_role;
