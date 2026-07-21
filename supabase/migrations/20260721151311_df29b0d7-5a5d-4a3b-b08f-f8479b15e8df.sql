ALTER VIEW public.v_invoices_with_balance SET (security_invoker = true);
ALTER VIEW public.v_overdue_invoices SET (security_invoker = true);
ALTER FUNCTION public.bump_version_optimistic() SET search_path = public;