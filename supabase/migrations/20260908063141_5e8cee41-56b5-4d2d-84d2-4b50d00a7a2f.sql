SET session_replication_role = 'replica';

DELETE FROM public.invoice_bookings
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE is_e2e = true)
     OR booking_id IN (SELECT id FROM public.bookings WHERE is_e2e = true);

DELETE FROM public.status_logs
  WHERE forklift_id IN (SELECT id FROM public.forklifts WHERE is_e2e = true);

DELETE FROM public.maintenance_logs WHERE is_e2e = true;

DELETE FROM public.notifications
  WHERE entity_id IN (SELECT id FROM public.customers WHERE is_e2e = true)
     OR entity_id IN (SELECT id FROM public.bookings WHERE is_e2e = true)
     OR entity_id IN (SELECT id FROM public.invoices WHERE is_e2e = true)
     OR entity_id IN (SELECT id FROM public.forklifts WHERE is_e2e = true)
     OR entity_id IN (SELECT id FROM public.quotes WHERE is_e2e = true)
     OR entity_id IN (SELECT id FROM public.maintenance_logs WHERE is_e2e = true);

DELETE FROM public.payments
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE is_e2e = true);

DELETE FROM public.audit_logs WHERE is_e2e = true;

DELETE FROM public.invoices WHERE is_e2e = true;
DELETE FROM public.bookings WHERE is_e2e = true;
DELETE FROM public.quotes WHERE is_e2e = true;
DELETE FROM public.forklifts WHERE is_e2e = true;
DELETE FROM public.equipment_models WHERE is_e2e = true;
DELETE FROM public.customers WHERE is_e2e = true;

DELETE FROM public.user_roles
  WHERE user_id IN (
    '90629659-1e00-4158-b0d4-a325bcd99fab',
    '47b14d44-caef-4ff1-bece-37883b060450',
    'ed462fae-658e-47ee-8b80-b60e5fa5e7c6'
  );

DELETE FROM public.profiles
  WHERE id IN (
    '90629659-1e00-4158-b0d4-a325bcd99fab',
    '47b14d44-caef-4ff1-bece-37883b060450',
    'ed462fae-658e-47ee-8b80-b60e5fa5e7c6'
  );

SET session_replication_role = 'origin';