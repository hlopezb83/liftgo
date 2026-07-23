-- R-arq 11.3 · Auditoría row-level en supplier_bills, bank_accounts, bank_statement_lines
-- Patrón de 20260215213953 (audit_trigger_fn). Idempotente.

DROP TRIGGER IF EXISTS audit_supplier_bills ON public.supplier_bills;
CREATE TRIGGER audit_supplier_bills
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_bank_accounts ON public.bank_accounts;
CREATE TRIGGER audit_bank_accounts
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_bank_statement_lines ON public.bank_statement_lines;
CREATE TRIGGER audit_bank_statement_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();