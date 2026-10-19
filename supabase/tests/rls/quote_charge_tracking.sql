-- Standalone synthetic fixtures; all business writes below roll back.
-- This exercises real SQL/RLS, not the browser's cached availability.
BEGIN;
DO $$ BEGIN
  IF NOT public.quote_charge_is_generated_equipment_line('{"description":"MC — Renta septiembre 2026 (19 días al precio diario)"}')
    OR NOT public.quote_charge_is_generated_equipment_line('{"description":"MC — Extensión: Renta mensual (prorrateo 3 días) (2026-10-01 al 2026-10-03) (Serie: 123)"}')
    OR NOT public.quote_charge_is_generated_equipment_line('{"description":"Toyota 8FG - Venta de equipo"}')
    OR public.quote_charge_is_generated_equipment_line('{"description":"Cargo por Renta mensual atrasada"}')
    OR public.quote_charge_is_generated_equipment_line('{"description":"MC — Renta mensual","line_kind":"charge"}') THEN
    RAISE EXCEPTION 'Known generator formats or explicit charge classification were lost';
  END IF;
END $$;
INSERT INTO public.organizations(id,name,slug) VALUES
 ('10700000-0000-4000-8000-00000000000a','Charge tracking A','charge-tracking-a'),
 ('10700000-0000-4000-8000-00000000000b','Charge tracking B','charge-tracking-b');
SELECT set_config('app.organization_id','10700000-0000-4000-8000-00000000000a',true);
INSERT INTO public.customers(id,name,created_by_organization_id) VALUES
 ('10700000-0000-4000-8000-000000000005','Cliente de prueba','10700000-0000-4000-8000-00000000000a');
INSERT INTO public.organization_customers(organization_id,customer_id) VALUES
 ('10700000-0000-4000-8000-00000000000a','10700000-0000-4000-8000-000000000005');
INSERT INTO public.quotes(id,organization_id,customer_id,quote_number,start_date,end_date,line_items)
VALUES ('10700000-0000-4000-8000-000000000010','10700000-0000-4000-8000-00000000000a','10700000-0000-4000-8000-000000000005',
 'COT-CHARGE',current_date,current_date+10,
 '[{"description":"Servicio de Logística","quantity":3,"unit_price":100,"total":300,"line_kind":"charge","quote_line_id":"10700000-0000-4000-8000-000000000011"},
   {"description":"Toyota — Renta mensual","quantity":1,"unit_price":1000,"total":1000}]');

CREATE FUNCTION pg_temp.qc_expect_block(p_sql text,p_constraint text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_blocked boolean:=false; v_constraint text;
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
    IF p_constraint IS NOT NULL AND v_constraint IS DISTINCT FROM p_constraint THEN
      RAISE EXCEPTION 'Wrong constraint: expected %, received %',p_constraint,v_constraint;
    END IF;
    v_blocked:=true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Expected rejection: %',p_sql; END IF;
END $$;
CREATE FUNCTION pg_temp.qc_invoice(p_id uuid,p_quantity numeric)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.invoices(id,organization_id,customer_id,invoice_number,quote_id,line_items,subtotal,tax_amount,total,moneda)
  VALUES (p_id,'10700000-0000-4000-8000-00000000000a','10700000-0000-4000-8000-000000000005',p_id::text,
   '10700000-0000-4000-8000-000000000010',jsonb_build_array(jsonb_build_object(
     'description','Servicio de Logística','quantity',p_quantity,'unit_price',100,'total',p_quantity*100,'line_kind','charge',
     'source_quote_id','10700000-0000-4000-8000-000000000010','source_quote_line_id','10700000-0000-4000-8000-000000000011')),
   p_quantity*100,0,p_quantity*100,'MXN');
$$;
DO $$ DECLARE v_id text; BEGIN
  SELECT line_items->1->>'quote_line_id' INTO v_id FROM public.quotes WHERE id='10700000-0000-4000-8000-000000000010';
  IF v_id IS NULL THEN RAISE EXCEPTION 'Source ID not initialized'; END IF;
  UPDATE public.quotes SET line_items=line_items WHERE id='10700000-0000-4000-8000-000000000010';
  IF (SELECT line_items->1->>'quote_line_id' FROM public.quotes WHERE id='10700000-0000-4000-8000-000000000010')<>v_id THEN
    RAISE EXCEPTION 'Source identity changed on unchanged save'; END IF;
  IF (SELECT line_items->0->>'charge_kind' FROM public.quotes WHERE id='10700000-0000-4000-8000-000000000010')<>'logistics' THEN
    RAISE EXCEPTION 'Generated charge kind missing'; END IF;
END $$;
SELECT pg_temp.qc_expect_block($s$INSERT INTO public.invoices(organization_id,invoice_number,quote_charge_tracking_version)
  VALUES('10700000-0000-4000-8000-00000000000a','FAC-NULL-MARKER',NULL)$s$);
SELECT pg_temp.qc_invoice('10700000-0000-4000-8000-000000000020',1);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.qc_expect_block($s$SELECT pg_temp.qc_invoice('10700000-0000-4000-8000-000000000021',3)$s$,'quote_charge_quantity_available');
SELECT pg_temp.qc_expect_block($s$UPDATE public.quotes SET line_items='[]' WHERE id='10700000-0000-4000-8000-000000000010'$s$,'quote_charge_source_immutable');
SELECT pg_temp.qc_expect_block($s$UPDATE public.invoices SET line_items=jsonb_set(jsonb_set(line_items,'{0,unit_price}','99'),'{0,total}','99'),subtotal=99,total=99
 WHERE id='10700000-0000-4000-8000-000000000020'$s$,'quote_charge_price_immutable');
SELECT pg_temp.qc_expect_block($s$UPDATE public.invoices SET line_items=jsonb_set(line_items,'{0,quantity}','"NaN"') WHERE id='10700000-0000-4000-8000-000000000020'$s$);

INSERT INTO auth.users(id,email) VALUES
 ('10700000-0000-4000-8000-000000000030','charge-admin@test.local'),
 ('10700000-0000-4000-8000-000000000031','charge-sales@test.local'),
 ('10700000-0000-4000-8000-000000000032','charge-admin-b@test.local');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('10700000-0000-4000-8000-000000000030','admin'),
 ('10700000-0000-4000-8000-000000000031','ventas'),
 ('10700000-0000-4000-8000-000000000032','admin');
INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES
 ('10700000-0000-4000-8000-00000000000a','10700000-0000-4000-8000-000000000030','internal'),
 ('10700000-0000-4000-8000-00000000000a','10700000-0000-4000-8000-000000000031','internal'),
 ('10700000-0000-4000-8000-00000000000b','10700000-0000-4000-8000-000000000032','internal');
SET LOCAL role='authenticated';
SET LOCAL request.jwt.claims='{"sub":"10700000-0000-4000-8000-000000000030","role":"authenticated"}';
DO $$ DECLARE v jsonb; BEGIN
  v:=public.get_quote_charge_availability(ARRAY['10700000-0000-4000-8000-000000000010'::uuid]);
  IF v->>'complete'<>'true' OR v#>>'{quotes,0,lines,0,remaining_quantity}'<>'2' THEN RAISE EXCEPTION 'Incorrect draft availability: %',v; END IF;
  v:=public.get_quote_charge_availability(ARRAY['10700000-0000-4000-8000-000000000010'::uuid],'10700000-0000-4000-8000-000000000020');
  IF v#>>'{quotes,0,lines,0,remaining_quantity}'<>'3' THEN RAISE EXCEPTION 'Own invoice exclusion incorrect'; END IF;
END $$;
SET LOCAL request.jwt.claims='{"sub":"10700000-0000-4000-8000-000000000031","role":"authenticated"}';
DO $$ DECLARE v_blocked boolean:=false; BEGIN
  BEGIN PERFORM public.get_quote_charge_availability(ARRAY['10700000-0000-4000-8000-000000000010'::uuid]);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Sales can read invoice charge history'; END IF;
END $$;
SET LOCAL request.jwt.claims='{"sub":"10700000-0000-4000-8000-000000000032","role":"authenticated"}';
DO $$ DECLARE v_blocked boolean:=false; BEGIN
  BEGIN PERFORM public.get_quote_charge_availability(ARRAY['10700000-0000-4000-8000-000000000010'::uuid]);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Cross-tenant charge history exposed'; END IF;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claims='{}';

INSERT INTO public.quotes(id,organization_id,quote_number,start_date,end_date,line_items)
VALUES ('10700000-0000-4000-8000-000000000040','10700000-0000-4000-8000-00000000000a','COT-NEW-ID',current_date,current_date+1,'[]');
UPDATE public.quotes SET line_items='[{"description":"Entrega","quantity":1,"unit_price":10,"total":10}]' WHERE id='10700000-0000-4000-8000-000000000040';
DO $$ BEGIN
  IF (SELECT line_items->0->>'quote_line_id' FROM public.quotes WHERE id='10700000-0000-4000-8000-000000000040') IS NULL THEN RAISE EXCEPTION 'Missing identity after empty quote'; END IF;
END $$;
UPDATE public.invoices SET status='cancelled' WHERE id='10700000-0000-4000-8000-000000000020';
SELECT pg_temp.qc_invoice('10700000-0000-4000-8000-000000000021',3);
UPDATE public.invoices SET status='issued' WHERE id='10700000-0000-4000-8000-000000000021';
SELECT pg_temp.qc_expect_block($s$UPDATE public.invoices SET status='draft',quote_charge_ever_issued=false WHERE id='10700000-0000-4000-8000-000000000021'$s$);
SELECT pg_temp.qc_expect_block($s$UPDATE public.invoices SET line_items='[]',subtotal=0,total=0 WHERE id='10700000-0000-4000-8000-000000000021'$s$);
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
