-- 1) Drivers: remove the open read policy and replace with role-scoped reads.
DROP POLICY IF EXISTS "Others read drivers" ON public.drivers;

-- Allow internal operational roles to read drivers (PII still protected from customers)
CREATE POLICY "Internal roles read drivers"
ON public.drivers
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'administrativo')
  OR public.has_role(auth.uid(), 'auditor')
  OR public.has_role(auth.uid(), 'dispatcher')
  OR public.has_role(auth.uid(), 'ventas')
  OR public.has_role(auth.uid(), 'mechanic')
);

-- 2) user_roles: add an explicit RESTRICTIVE policy so only admins can ever
-- insert/update/delete roles, even if a future permissive policy is added.
DROP POLICY IF EXISTS "Only admins can modify roles" ON public.user_roles;
CREATE POLICY "Only admins can modify roles"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));