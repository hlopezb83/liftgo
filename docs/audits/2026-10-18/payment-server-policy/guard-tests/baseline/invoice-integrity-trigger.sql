CREATE TRIGGER trg_guard_invoice_status_integrity BEFORE INSERT OR UPDATE OF status, total, moneda, tipo_cambio ON public.invoices FOR EACH ROW EXECUTE FUNCTION guard_invoice_status_integrity();
CREATE TRIGGER trg_credit_notes_max_check BEFORE INSERT OR UPDATE OF total, status, cancellation_status, invoice_id ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION enforce_credit_note_max();
