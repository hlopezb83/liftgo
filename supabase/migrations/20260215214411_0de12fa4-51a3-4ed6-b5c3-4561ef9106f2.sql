
-- Add user_id column to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id) WHERE user_id IS NOT NULL;

-- Helper function to get customer_id from auth user_id
CREATE OR REPLACE FUNCTION public.get_customer_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM customers WHERE user_id = p_user_id LIMIT 1;
$$;

-- Customer RLS policies (SELECT only on their own data)

CREATE POLICY "Customers read own bookings"
ON public.bookings FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'customer'::app_role) AND
  customer_id = get_customer_id_for_user(auth.uid())
);

CREATE POLICY "Customers read own invoices"
ON public.invoices FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'customer'::app_role) AND
  customer_id = get_customer_id_for_user(auth.uid())
);

CREATE POLICY "Customers read own contracts"
ON public.contracts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'customer'::app_role) AND
  customer_id = get_customer_id_for_user(auth.uid())
);

CREATE POLICY "Customers read own payments"
ON public.payments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'customer'::app_role) AND
  invoice_id IN (
    SELECT id FROM invoices WHERE customer_id = get_customer_id_for_user(auth.uid())
  )
);

CREATE POLICY "Customers read own deliveries"
ON public.deliveries FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'customer'::app_role) AND
  booking_id IN (
    SELECT id FROM bookings WHERE customer_id = get_customer_id_for_user(auth.uid())
  )
);

CREATE POLICY "Customers read own record"
ON public.customers FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'customer'::app_role) AND
  id = get_customer_id_for_user(auth.uid())
);

CREATE POLICY "Customers read forklifts"
ON public.forklifts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'customer'::app_role)
);
