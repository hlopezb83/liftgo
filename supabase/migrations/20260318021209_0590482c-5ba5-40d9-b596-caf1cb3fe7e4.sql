
-- 1. Collection notes table
CREATE TABLE public.collection_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  note text NOT NULL,
  next_followup_date date,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.collection_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage collection notes" ON public.collection_notes
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Transport cost fields on deliveries
ALTER TABLE public.deliveries ADD COLUMN transport_cost numeric DEFAULT 0;
ALTER TABLE public.deliveries ADD COLUMN charged_to_customer boolean DEFAULT false;

-- 3. Booking extensions table
CREATE TABLE public.booking_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  original_end_date date NOT NULL,
  new_end_date date NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.booking_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage booking extensions" ON public.booking_extensions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Insurance fields on forklifts
ALTER TABLE public.forklifts ADD COLUMN insurance_provider text;
ALTER TABLE public.forklifts ADD COLUMN insurance_policy_number text;
ALTER TABLE public.forklifts ADD COLUMN insurance_expiry date;
ALTER TABLE public.forklifts ADD COLUMN insurance_cost numeric;

-- 5. Site contact on bookings
ALTER TABLE public.bookings ADD COLUMN site_contact_name text;
ALTER TABLE public.bookings ADD COLUMN site_contact_phone text;

-- 6. Customer profitability RPC
CREATE OR REPLACE FUNCTION public.get_customer_profitability(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  v_revenue numeric;
  v_maintenance_cost numeric;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_revenue
  FROM invoices
  WHERE customer_id = p_customer_id AND status IN ('paid', 'partial', 'sent', 'overdue');

  SELECT COALESCE(SUM(ml.cost), 0) INTO v_maintenance_cost
  FROM maintenance_logs ml
  JOIN bookings b ON b.forklift_id = ml.forklift_id
    AND ml.performed_at::date BETWEEN b.start_date AND b.end_date
  WHERE b.customer_id = p_customer_id;

  result := jsonb_build_object(
    'revenue', v_revenue,
    'maintenance_cost', v_maintenance_cost,
    'gross_margin', v_revenue - v_maintenance_cost,
    'margin_percent', CASE WHEN v_revenue > 0
      THEN ROUND(((v_revenue - v_maintenance_cost) / v_revenue) * 100, 1)
      ELSE 0 END
  );

  RETURN result;
END;
$$;
