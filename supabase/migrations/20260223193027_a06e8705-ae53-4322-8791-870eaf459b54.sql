-- Fix profiles RLS: staff can view all profiles, customers only their own
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'dispatcher'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role) OR
  has_role(auth.uid(), 'mechanic'::app_role)
);