
-- ============================================================
-- 1. AUTHENTICATION & RBAC
-- ============================================================

-- Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'dispatcher', 'mechanic');

-- User roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  -- Default role: dispatcher
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'dispatcher');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles RLS
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles RLS (only admins can manage, users can read own)
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update RLS on existing tables: allow all authenticated users (role checks done in UI)
-- Drop old public policies and create authenticated ones

-- bookings
DROP POLICY IF EXISTS "Public access to bookings" ON public.bookings;
CREATE POLICY "Authenticated access to bookings" ON public.bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- customers
DROP POLICY IF EXISTS "Public access to customers" ON public.customers;
CREATE POLICY "Authenticated access to customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- deliveries
DROP POLICY IF EXISTS "Public access to deliveries" ON public.deliveries;
CREATE POLICY "Authenticated access to deliveries" ON public.deliveries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- documents
DROP POLICY IF EXISTS "Public access to documents" ON public.documents;
CREATE POLICY "Authenticated access to documents" ON public.documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- equipment_models
DROP POLICY IF EXISTS "Public access to equipment_models" ON public.equipment_models;
CREATE POLICY "Authenticated access to equipment_models" ON public.equipment_models FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- forklifts
DROP POLICY IF EXISTS "Public access to forklifts" ON public.forklifts;
CREATE POLICY "Authenticated access to forklifts" ON public.forklifts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- invoices
DROP POLICY IF EXISTS "Public access to invoices" ON public.invoices;
CREATE POLICY "Authenticated access to invoices" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- maintenance_logs
DROP POLICY IF EXISTS "Public access to maintenance_logs" ON public.maintenance_logs;
CREATE POLICY "Authenticated access to maintenance_logs" ON public.maintenance_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- return_inspections
DROP POLICY IF EXISTS "Public access to return_inspections" ON public.return_inspections;
CREATE POLICY "Authenticated access to return_inspections" ON public.return_inspections FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- status_logs
DROP POLICY IF EXISTS "Public access to status_logs" ON public.status_logs;
CREATE POLICY "Authenticated access to status_logs" ON public.status_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. QUOTES TABLE
-- ============================================================
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL,
  customer_id uuid REFERENCES public.customers(id),
  customer_name text,
  forklift_id uuid REFERENCES public.forklifts(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  valid_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access to quotes" ON public.quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.next_quote_number()
RETURNS text
LANGUAGE sql
SET search_path = public
AS $$
  SELECT 'QUO-' || lpad((coalesce(max(
    nullif(regexp_replace(quote_number, '[^0-9]', '', 'g'), '')::int
  ), 0) + 1)::text, 4, '0')
  FROM quotes;
$$;

-- ============================================================
-- 3. BOOKINGS: recurring billing columns
-- ============================================================
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS recurring_billing boolean NOT NULL DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS last_billed_date date;

-- ============================================================
-- 4. ACTIVITY FEED
-- ============================================================
CREATE TABLE public.activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access to activity_feed" ON public.activity_feed FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger function for activity feed
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_feed (event_type, entity_type, entity_id, title, description)
  VALUES (
    TG_OP,
    TG_TABLE_NAME,
    NEW.id,
    TG_OP || ' ' || TG_TABLE_NAME,
    'A ' || TG_TABLE_NAME || ' record was ' || lower(TG_OP) || 'd'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER activity_bookings AFTER INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER activity_invoices AFTER INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER activity_return_inspections AFTER INSERT ON public.return_inspections FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER activity_maintenance_logs AFTER INSERT ON public.maintenance_logs FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- ============================================================
-- 5. DAMAGE RECORDS
-- ============================================================
CREATE TABLE public.damage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid REFERENCES public.return_inspections(id),
  forklift_id uuid REFERENCES public.forklifts(id) NOT NULL,
  booking_id uuid REFERENCES public.bookings(id),
  customer_id uuid REFERENCES public.customers(id),
  description text NOT NULL,
  estimated_cost numeric DEFAULT 0,
  actual_cost numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'reported',
  maintenance_log_id uuid REFERENCES public.maintenance_logs(id),
  invoice_id uuid REFERENCES public.invoices(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.damage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access to damage_records" ON public.damage_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_damage_records_updated_at
  BEFORE UPDATE ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
