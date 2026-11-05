-- Isolated PostgreSQL fixture only. Never run against a product database.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION public.current_internal_organization_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.org',true),'')::uuid $$;
CREATE FUNCTION public.organization_scope_matches(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1 = public.current_internal_organization_id() $$;
CREATE FUNCTION public.is_internal_member(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1 IS NOT NULL AND current_setting('test.internal',true) = 'yes' $$;
CREATE FUNCTION public.today_mty() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Monterrey')::date $$;
CREATE TABLE organizations(id uuid PRIMARY KEY,name text,slug text,is_active boolean DEFAULT true);
CREATE TABLE payments(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE invoice_bookings(invoice_id uuid,booking_id uuid,line_index integer,organization_id uuid);
CREATE TABLE forklifts(id uuid PRIMARY KEY,organization_id uuid,name text,status text,serial_number text);
CREATE TABLE bookings(id uuid PRIMARY KEY,organization_id uuid,booking_number text,status text,forklift_id uuid,start_date date);
CREATE TABLE deliveries(id uuid PRIMARY KEY,organization_id uuid,delivery_number text,booking_id uuid,forklift_id uuid,status text,type text,completed_at timestamptz,signature_base64 text);
CREATE TABLE quotes(id uuid PRIMARY KEY,organization_id uuid,quote_type text);
CREATE TABLE invoices(id uuid PRIMARY KEY,organization_id uuid,invoice_number text,issued_at date,line_items jsonb,quote_id uuid);
CREATE TABLE return_inspections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,booking_id uuid,forklift_id uuid,inspection_number text);
CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),table_name text,record_id uuid,action text,old_data jsonb,new_data jsonb,user_id uuid,source text,organization_id uuid);
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
GRANT SELECT ON deliveries TO authenticated;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY scope_read ON deliveries TO authenticated USING (organization_id=current_internal_organization_id() AND current_setting('test.delivery_access',true)='yes');
INSERT INTO organizations(id,name,slug) VALUES ('2ec4801d-ffb1-49b6-aada-9dcdbdda6d74','HERREN ENERGY','herren-energy'),('00000000-0000-0000-0000-000000000002','SYNTHETIC OTHER','other');
DO $$ DECLARE t record; fid uuid; bid uuid; qid uuid; BEGIN
FOR t IN SELECT * FROM (VALUES
 ('787e8d1b-8e51-4850-9da0-4641cfa5d036'::uuid,'ENT-0002','RSV-0005','2025-10-23'::date,NULL::text,NULL::text,NULL::text),
 ('c51e3260-808f-4e92-823e-4ce1f952be15','ENT-0007','RSV-0008','2025-12-12',NULL,NULL,NULL),
 ('08b98a50-6bf0-448f-bf29-e2a260a0737d','ENT-0009','RSV-0010','2026-02-04','DEV-0001',NULL,NULL),
 ('f099316a-06aa-4e2b-a773-31ccaade1c0d','ENT-0022','RSV-0021','2026-06-22','DEV-0004',NULL,NULL),
 ('3b298096-cb10-4318-a42f-6e2f278c681f','ENT-0023','RSV-0022','2026-06-09','DEV-0006',NULL,NULL),
 ('46a71103-4481-4736-9dd5-32f79766d5a6','ENT-0024','RSV-0023','2026-07-03','DEV-0005',NULL,NULL),
 ('b21d787e-216e-43b5-b108-684a86ac4817','ENT-0010',NULL,'2025-10-20',NULL,'FAC-0025','05035DS4972'),
 ('38cfba10-b00d-45a8-aef2-f50ef0c788f5','ENT-0011',NULL,'2025-10-20',NULL,'FAC-0026','05035DS4974')
) v(id,number,booking_number,reference_date,inspection_number,invoice_number,serial_number) LOOP
 fid:=gen_random_uuid(); bid:=NULL;
 INSERT INTO forklifts VALUES(fid,'2ec4801d-ffb1-49b6-aada-9dcdbdda6d74','SYNTHETIC-'||t.number,CASE WHEN t.invoice_number IS NOT NULL THEN 'sold' WHEN t.number='ENT-0024' THEN 'rented' ELSE 'available' END,t.serial_number);
 IF t.booking_number IS NOT NULL THEN
   bid:=gen_random_uuid(); INSERT INTO bookings VALUES(bid,'2ec4801d-ffb1-49b6-aada-9dcdbdda6d74',t.booking_number,'completed',fid,t.reference_date);
   IF t.inspection_number IS NOT NULL THEN INSERT INTO return_inspections(organization_id,booking_id,forklift_id,inspection_number) VALUES('2ec4801d-ffb1-49b6-aada-9dcdbdda6d74',bid,fid,t.inspection_number); END IF;
 ELSE
   qid:=gen_random_uuid(); INSERT INTO quotes VALUES(qid,'2ec4801d-ffb1-49b6-aada-9dcdbdda6d74','sale');
   INSERT INTO invoices VALUES(gen_random_uuid(),'2ec4801d-ffb1-49b6-aada-9dcdbdda6d74',t.invoice_number,t.reference_date,jsonb_build_array(jsonb_build_object('description','SYNTHETIC-'||t.number||' '||t.serial_number||' Venta de equipo')),qid);
 END IF;
 INSERT INTO deliveries VALUES(t.id,'2ec4801d-ffb1-49b6-aada-9dcdbdda6d74',t.number,bid,fid,'scheduled','delivery',NULL,NULL);
END LOOP; END $$;
CREATE FUNCTION forbidden_original_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Original table mutated: %',TG_TABLE_NAME; END $$;
CREATE TRIGGER forbid_delivery BEFORE INSERT OR UPDATE OR DELETE ON deliveries FOR EACH ROW EXECUTE FUNCTION forbidden_original_mutation();
CREATE TRIGGER forbid_booking BEFORE INSERT OR UPDATE OR DELETE ON bookings FOR EACH ROW EXECUTE FUNCTION forbidden_original_mutation();
CREATE TRIGGER forbid_forklift BEFORE INSERT OR UPDATE OR DELETE ON forklifts FOR EACH ROW EXECUTE FUNCTION forbidden_original_mutation();
CREATE TRIGGER forbid_invoice BEFORE INSERT OR UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION forbidden_original_mutation();
