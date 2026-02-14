-- Attach activity logging triggers to key tables
CREATE TRIGGER log_activity_bookings AFTER INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_activity_invoices AFTER INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_activity_forklifts AFTER INSERT OR UPDATE ON public.forklifts FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER log_activity_maintenance_logs AFTER INSERT OR UPDATE ON public.maintenance_logs FOR EACH ROW EXECUTE FUNCTION public.log_activity();