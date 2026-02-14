
-- Phase 3C: Add indexes on frequently queried FK columns
CREATE INDEX IF NOT EXISTS idx_bookings_forklift_id ON public.bookings(forklift_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_booking_id ON public.invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_forklift_id ON public.maintenance_logs(forklift_id);
CREATE INDEX IF NOT EXISTS idx_status_logs_forklift_id ON public.status_logs(forklift_id);
CREATE INDEX IF NOT EXISTS idx_damage_records_forklift_id ON public.damage_records(forklift_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_forklift_id ON public.deliveries(forklift_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_booking_id ON public.deliveries(booking_id);
CREATE INDEX IF NOT EXISTS idx_return_inspections_forklift_id ON public.return_inspections(forklift_id);
CREATE INDEX IF NOT EXISTS idx_return_inspections_booking_id ON public.return_inspections(booking_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON public.documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
