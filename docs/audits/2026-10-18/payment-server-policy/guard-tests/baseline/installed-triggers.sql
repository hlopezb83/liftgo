-- Exact wiring from current catalog; omitted side effects and organization guard are listed in README.
CREATE TRIGGER sync_invoice_status_from_payments_trg AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION sync_invoice_status_from_payments();
CREATE TRIGGER trg_enforce_payment_within_invoice_total BEFORE INSERT OR UPDATE OF amount, invoice_id ON public.payments FOR EACH ROW EXECUTE FUNCTION enforce_payment_within_invoice_total();
CREATE TRIGGER trg_payments_amount_mxn BEFORE INSERT OR UPDATE OF amount, exchange_rate, invoice_id ON public.payments FOR EACH ROW EXECUTE FUNCTION trg_payment_amount_mxn();
CREATE TRIGGER trg_payments_currency_matches_invoice BEFORE INSERT OR UPDATE OF currency, invoice_id, exchange_rate, amount ON public.payments FOR EACH ROW EXECUTE FUNCTION enforce_payment_matches_invoice_currency();
CREATE TRIGGER trg_payments_fiscal_period_open BEFORE INSERT OR UPDATE OF payment_date ON public.payments FOR EACH ROW EXECUTE FUNCTION trg_guard_payment_fiscal_period();
CREATE TRIGGER trg_payments_payment_date_window BEFORE INSERT OR UPDATE OF payment_date, invoice_id ON public.payments FOR EACH ROW EXECUTE FUNCTION trg_payment_date_window();
CREATE TRIGGER trg_prevent_payment_delete_stamped BEFORE DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION prevent_payment_delete_when_rep_stamped();
CREATE TRIGGER trg_prevent_payment_mutation_stamped BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION prevent_payment_mutation_when_rep_stamped();
CREATE TRIGGER trg_round_payment_amount BEFORE INSERT OR UPDATE OF amount ON public.payments FOR EACH ROW EXECUTE FUNCTION round_payment_amount();