\set ON_ERROR_STOP on
-- LOCAL SYNTHETIC FIXTURE ONLY. This file never targets application data.
CREATE TABLE public.precision_expectations(id text PRIMARY KEY, profile text, expected text, actual text, passed boolean, message text, before_row jsonb, after_row jsonb);
GRANT INSERT,SELECT ON public.precision_expectations TO authenticated;
CREATE FUNCTION pg_temp.observe(id text,profile text,bill uuid,patch jsonb,expected text,persisted jsonb,metadata boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE before_image jsonb; after_image jsonb; code text:='00000'; msg text:='accepted'; result uuid; ok boolean;
BEGIN
 SELECT to_jsonb(b) INTO before_image FROM public.supplier_bills b WHERE b.id=bill;
 BEGIN result:=public.update_supplier_bill_details(bill,patch);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,msg=MESSAGE_TEXT; END;
 SELECT to_jsonb(b) INTO after_image FROM public.supplier_bills b WHERE b.id=bill;
 ok:=code=expected AND CASE WHEN code='00000' THEN result=bill AND after_image @> persisted
   AND (NOT metadata OR (after_image-'description'-'updated_at') IS NOT DISTINCT FROM (before_image-'description'-'updated_at'))
   ELSE after_image IS NOT DISTINCT FROM before_image END;
 INSERT INTO public.precision_expectations VALUES(id,profile,expected,code,ok,msg,before_image,after_image);
 RAISE NOTICE '% % expected=% actual=%',CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END,id,expected,code;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000900','SYNTHETIC-PRECISION-0','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_metadata_full_identical','versioned-typmods','00000000-0000-4000-8000-000000000900',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000900';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000901','SYNTHETIC-PRECISION-1','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,90,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_legacy_formula_mismatch_metadata','versioned-typmods','00000000-0000-4000-8000-000000000901',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited","total":90}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000901';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000902','SYNTHETIC-PRECISION-2','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,90,'00000000-0000-4000-8000-000000000101','approved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_approved_formula_mismatch_metadata','versioned-typmods','00000000-0000-4000-8000-000000000902',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited","total":90}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000902';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000903','SYNTHETIC-PRECISION-3','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_fractional_subtotal_normalizes','versioned-typmods','00000000-0000-4000-8000-000000000903',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited","subtotal":100.001}'::jsonb,
 '00000','{"subtotal":100,"total":100}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000903';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000904','SYNTHETIC-PRECISION-4','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_fractional_rate_normalizes','versioned-typmods','00000000-0000-4000-8000-000000000904',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited","exchange_rate":17.1234567}'::jsonb,
 '00000','{"exchange_rate":17.123457,"total":100}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000904';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000905','SYNTHETIC-PRECISION-5','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_fractional_discount_normalizes','versioned-typmods','00000000-0000-4000-8000-000000000905',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited","discount":10.001,"total":90}'::jsonb,
 '00000','{"discount":10,"total":90}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000905';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000906','SYNTHETIC-PRECISION-6','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','approved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_approved_raw_subtotal_change_locked','versioned-typmods','00000000-0000-4000-8000-000000000906',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited","subtotal":100.001}'::jsonb,
 '23514','{}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000906';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000907','SYNTHETIC-PRECISION-7','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','approved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_approved_raw_rate_change_locked','versioned-typmods','00000000-0000-4000-8000-000000000907',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited","exchange_rate":17.50000001}'::jsonb,
 '23514','{}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000907';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000908','SYNTHETIC-PRECISION-8','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,10,0,0,0,90,'00000000-0000-4000-8000-000000000101','approved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_approved_raw_discount_change_locked','versioned-typmods','00000000-0000-4000-8000-000000000908',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited","discount":10.001}'::jsonb,
 '23514','{}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000908';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000909','SYNTHETIC-PRECISION-9','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','approved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_approved_full_identical_metadata','versioned-typmods','00000000-0000-4000-8000-000000000909',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000909';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000910','SYNTHETIC-PRECISION-10','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_fractional_components_inconsistent_final_total','versioned-typmods','00000000-0000-4000-8000-000000000910',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"subtotal":100.004,"tax_amount":0.004,"total":100.01}'::jsonb,
 '23514','{}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000910';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000911','SYNTHETIC-PRECISION-11','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_negative_fraction_before_coercion','versioned-typmods','00000000-0000-4000-8000-000000000911',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"discount":-0.001}'::jsonb,
 '23514','{}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000911';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000912','SYNTHETIC-PRECISION-12','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_rate_rounds_to_zero_rejected','versioned-typmods','00000000-0000-4000-8000-000000000912',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"exchange_rate":1e-7}'::jsonb,
 '23514','{}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000912';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000913','SYNTHETIC-PRECISION-13','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_unknown_key_rejected','versioned-typmods','00000000-0000-4000-8000-000000000913',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"unknown_field":1}'::jsonb,
 '22023','{}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000913';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000914','SYNTHETIC-PRECISION-14','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_numeric_string_rejected','versioned-typmods','00000000-0000-4000-8000-000000000914',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"subtotal":"100"}'::jsonb,
 '22023','{}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000914';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000915','SYNTHETIC-PRECISION-15','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_discount_change_requires_explicit_total','versioned-typmods','00000000-0000-4000-8000-000000000915',
 '{"discount":10}'::jsonb,
 '22023','{}'::jsonb,false);

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000916','SYNTHETIC-PRECISION-16','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('typed_discount_cannot_exceed_subtotal','versioned-typmods','00000000-0000-4000-8000-000000000916',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"discount":101,"total":0}'::jsonb,
 '23514','{}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000916';

RESET ROLE;
-- Explicit compatibility experiment. The versioned schema above cannot store
-- this precision. This widening is synthetic and is NOT an application proposal.
DO $$
DECLARE definitions text[]; trigger_name text; definition text;
BEGIN
 SELECT array_agg(pg_get_triggerdef(oid) ORDER BY tgname) INTO definitions
 FROM pg_trigger WHERE tgrelid='public.supplier_bills'::regclass AND NOT tgisinternal;
 FOR trigger_name IN SELECT tgname FROM pg_trigger WHERE tgrelid='public.supplier_bills'::regclass AND NOT tgisinternal LOOP
  EXECUTE format('DROP TRIGGER %I ON public.supplier_bills',trigger_name);
 END LOOP;
 ALTER TABLE public.supplier_bills
  ALTER COLUMN subtotal TYPE numeric, ALTER COLUMN discount TYPE numeric,
  ALTER COLUMN tax_amount TYPE numeric, ALTER COLUMN retention_iva TYPE numeric,
  ALTER COLUMN retention_isr TYPE numeric, ALTER COLUMN total TYPE numeric,
  ALTER COLUMN exchange_rate TYPE numeric;
 FOREACH definition IN ARRAY definitions LOOP EXECUTE definition; END LOOP;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000917','SYNTHETIC-PRECISION-17','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.1234567,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_rate_identical_metadata','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000917',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000917';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000918','SYNTHETIC-PRECISION-18','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100.001,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_subtotal_identical_metadata','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000918',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000918';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000919','SYNTHETIC-PRECISION-19','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,10.001,0,0,0,89.999,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_discount_identical_metadata','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000919',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000919';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000920','SYNTHETIC-PRECISION-20','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0.001,0,0,100.001,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_tax_identical_metadata','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000920',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000920';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000921','SYNTHETIC-PRECISION-21','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0.001,0,99.999,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_retention_iva_identical_metadata','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000921',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000921';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000922','SYNTHETIC-PRECISION-22','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0.001,99.999,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_retention_isr_identical_metadata','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000922',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000922';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000923','SYNTHETIC-PRECISION-23','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100.001,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_total_identical_metadata','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000923',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000923';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000924','SYNTHETIC-PRECISION-24','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.1234567,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','approved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_approved_rate_identical_metadata','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000924',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000924';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000925','SYNTHETIC-PRECISION-25','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100.001,0,0,0,0,100.001,'00000000-0000-4000-8000-000000000101','approved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_approved_amounts_identical_metadata','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000925',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000925';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000926','SYNTHETIC-PRECISION-26','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.1234567,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_rate_identical_real_discount_change','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000926',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"discount":10,"total":90}'::jsonb,
 '00000','{"exchange_rate":17.1234567,"discount":10,"total":90}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000926';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000927','SYNTHETIC-PRECISION-27','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_new_precision_follows_existing_type','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000927',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"discount":10.001,"total":90}'::jsonb,
 '00000','{"discount":10.001,"total":90}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000927';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000928','SYNTHETIC-PRECISION-28','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.5,100.001,0,0,0,0,100,'00000000-0000-4000-8000-000000000101','approved');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_approved_real_subtotal_change_locked','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000928',
 (SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url'])) || '{"subtotal":100.002}'::jsonb,
 '23514','{}'::jsonb,false) FROM public.supplier_bills b WHERE b.id='00000000-0000-4000-8000-000000000928';

RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,supplier_id,category,description,issue_date,currency,exchange_rate,subtotal,discount,tax_amount,retention_iva,retention_isr,total,organization_id,approval_status) VALUES('00000000-0000-4000-8000-000000000929','SYNTHETIC-PRECISION-29','00000000-0000-4000-8000-000000000301','renta','before','2026-10-18','USD',17.1234567,100,0,0,0,0,100.001,'00000000-0000-4000-8000-000000000101','not_required');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe('legacy_sparse_metadata_control','hypothetical-bare-numeric','00000000-0000-4000-8000-000000000929',
 '{"description":"description edited"}'::jsonb,
 '00000','{"description":"description edited"}'::jsonb,true);

RESET ROLE;
