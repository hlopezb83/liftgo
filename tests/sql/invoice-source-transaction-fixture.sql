-- Minimal disposable fixture, never a migration or production seed.
-- The runner installs actual invoice/save/sync/source functions from migrations.
-- These simplified policies exercise invoker visibility, not the full role matrix.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
  SELECT '12700000-0000-4000-8000-000000000099'::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$
  SELECT '{"role":"authenticated"}'::jsonb
$$;
CREATE FUNCTION public.today_mty() RETURNS date LANGUAGE sql AS $$SELECT '2026-11-07'::date$$;
CREATE SEQUENCE invoice_seq;
CREATE FUNCTION public.next_draft_invoice_number() RETURNS text LANGUAGE sql AS $$
  SELECT 'QA-' || nextval('invoice_seq')
$$;

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL DEFAULT current_setting('qa.org')::uuid,
  customer_id uuid, booking_number text, quote_id uuid, status text DEFAULT 'confirmed',
  start_date date, end_date date, recurring_billing boolean DEFAULT false
);
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL DEFAULT current_setting('qa.org')::uuid,
  customer_id uuid, status text DEFAULT 'sent', version integer NOT NULL DEFAULT 1,
  valid_until date, accepted_at timestamptz
);
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_setting('qa.org')::uuid,
  invoice_number text, booking_id uuid REFERENCES public.bookings, customer_id uuid,
  customer_name text, quote_id uuid REFERENCES public.quotes, line_items jsonb,
  subtotal numeric, tax_rate numeric, tax_amount numeric, total numeric,
  due_date date, issued_at date, billing_period_start date, billing_period_end date,
  notes text, serie text, folio text, forma_pago text, metodo_pago text, uso_cfdi text,
  moneda text, tipo_cambio numeric, receptor_rfc text, receptor_razon_social text,
  receptor_regimen_fiscal text, receptor_domicilio_fiscal_cp text,
  global_periodicity text, global_months text, global_year integer,
  status text DEFAULT 'draft', cfdi_uuid uuid, cfdi_status text,
  version integer NOT NULL DEFAULT 1
);
CREATE TABLE public.invoice_bookings (
  invoice_id uuid REFERENCES public.invoices, booking_id uuid REFERENCES public.bookings,
  organization_id uuid NOT NULL DEFAULT current_setting('qa.org')::uuid,
  line_index integer, PRIMARY KEY (invoice_id, booking_id)
);
CREATE TABLE public.booking_extensions (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL DEFAULT current_setting('qa.org')::uuid,
  booking_id uuid REFERENCES public.bookings, original_end_date date, new_end_date date,
  invoice_id uuid REFERENCES public.invoices, billed_at timestamptz,
  pending_invoice_id uuid REFERENCES public.invoices
);
CREATE TABLE public.damage_records (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL DEFAULT current_setting('qa.org')::uuid,
  customer_id uuid, status text, repaired_at timestamptz, deleted_at timestamptz,
  invoice_id uuid REFERENCES public.invoices, updated_at timestamptz
);

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
GRANT USAGE ON SEQUENCE invoice_seq TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
DO $setup$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['bookings','quotes','invoices','invoice_bookings','booking_extensions','damage_records'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('CREATE POLICY readable ON public.%I FOR SELECT TO authenticated USING (organization_id=current_setting(''qa.org'')::uuid)', v_table);
    EXECUTE format('CREATE POLICY writable_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (organization_id=current_setting(''qa.org'')::uuid)', v_table);
    EXECUTE format('CREATE POLICY writable_delete ON public.%I FOR DELETE TO authenticated USING (organization_id=current_setting(''qa.org'')::uuid)', v_table);
    EXECUTE format('CREATE POLICY writable_update ON public.%I FOR UPDATE TO authenticated USING (organization_id=current_setting(''qa.org'')::uuid AND coalesce(current_setting(''qa.deny_update'',true),'''')<>%L) WITH CHECK (organization_id=current_setting(''qa.org'')::uuid)', v_table, v_table);
  END LOOP;
END;
$setup$;

-- Deterministic failure injection proves row-count checks, after the source
-- has already been visible/locked. Disabled by default and only in this fixture.
CREATE FUNCTION public.qa_drop_source_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('qa.drop_update',true)=TG_TABLE_NAME THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER qa_drop_update BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.qa_drop_source_update();
CREATE TRIGGER qa_drop_update BEFORE UPDATE ON public.booking_extensions
  FOR EACH ROW EXECUTE FUNCTION public.qa_drop_source_update();
