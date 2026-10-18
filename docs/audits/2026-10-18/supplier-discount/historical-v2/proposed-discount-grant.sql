-- PROPOSAL ONLY. Not in an automatic migration directory.
-- Apply to a published database only after the coordinator verifies its
-- project/database, current ACL/RLS, and obtains specific approval.
-- Existing RLS still decides which rows each authenticated user may update.
GRANT UPDATE (discount) ON public.supplier_bills TO authenticated;
