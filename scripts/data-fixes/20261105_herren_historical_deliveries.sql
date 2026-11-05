-- Explicit user-approved one-time reconciliation, 2026-11-05. Run as database
-- owner only, AFTER migration 0126 and review. All-or-nothing and idempotent.
-- No signatures, completed timestamps, equipment, bookings or invoices change.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL timezone = 'UTC';
SET LOCAL search_path = public, pg_temp;
DO $$
DECLARE
  org constant uuid := '2ec4801d-ffb1-49b6-aada-9dcdbdda6d74';
  before_state jsonb;
  after_state jsonb;
  target record;
  d public.deliveries%ROWTYPE;
  b public.bookings%ROWTYPE;
  f public.forklifts%ROWTYPE;
  i public.invoices%ROWTYPE;
  ev jsonb;
  cls text;
  basis text;
  why text;
  auth_source constant text := 'Usuario autorizó explícitamente preparar, probar, implementar y aplicar la conciliación de estas ocho entregas el 2026-11-05. Ventas: fecha de factura; rentas: fecha de inicio de reserva. Sin cambios a equipos, reservas, facturas ni firmas.';
BEGIN
  IF current_user <> 'postgres' OR auth.uid() IS NOT NULL
     OR current_setting('session_replication_role') <> 'origin'
     OR coalesce(current_setting('app.audit_revert',true),'')='on'
     OR coalesce(current_setting('app.e2e_teardown',true),'')='on'
     OR coalesce(current_setting('app.e2e_seed',true),'')='on' THEN
    RAISE EXCEPTION 'Requires owner session without actor impersonation or bypass flags';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id=org AND name='HERREN ENERGY' AND slug='herren-energy' AND is_active) THEN
    RAISE EXCEPTION 'Organization identity changed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public.deliveries'::regclass,'public.bookings'::regclass,
       'public.forklifts'::regclass,'public.invoices'::regclass,'public.delivery_historical_reconciliations'::regclass)
       AND NOT tgisinternal AND tgenabled<>'O') THEN
    RAISE EXCEPTION 'Expected origin-enabled business triggers';
  END IF;
  SELECT jsonb_build_object(
    'deliveries', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM public.deliveries x WHERE organization_id=org),
    'bookings', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM public.bookings x WHERE organization_id=org),
    'forklifts', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM public.forklifts x WHERE organization_id=org),
    'payments', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM public.payments x WHERE organization_id=org),
    'invoice_bookings', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY invoice_id,booking_id,line_index)::text,'[]')) FROM public.invoice_bookings x WHERE organization_id=org),
    'invoices', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM public.invoices x WHERE organization_id=org)
  ) INTO before_state;
  FOR target IN SELECT * FROM (VALUES
    ('787e8d1b-8e51-4850-9da0-4641cfa5d036'::uuid,'ENT-0002','RSV-0005','2025-10-23'::date,NULL::text,NULL::text,NULL::text),
    ('c51e3260-808f-4e92-823e-4ce1f952be15'::uuid,'ENT-0007','RSV-0008','2025-12-12'::date,NULL,NULL,NULL),
    ('08b98a50-6bf0-448f-bf29-e2a260a0737d'::uuid,'ENT-0009','RSV-0010','2026-02-04'::date,'DEV-0001',NULL,NULL),
    ('f099316a-06aa-4e2b-a773-31ccaade1c0d'::uuid,'ENT-0022','RSV-0021','2026-06-22'::date,'DEV-0004',NULL,NULL),
    ('3b298096-cb10-4318-a42f-6e2f278c681f'::uuid,'ENT-0023','RSV-0022','2026-06-09'::date,'DEV-0006',NULL,NULL),
    ('46a71103-4481-4736-9dd5-32f79766d5a6'::uuid,'ENT-0024','RSV-0023','2026-07-03'::date,'DEV-0005',NULL,NULL),
    ('b21d787e-216e-43b5-b108-684a86ac4817'::uuid,'ENT-0010',NULL,'2025-10-20'::date,NULL,'FAC-0025','05035DS4972'),
    ('38cfba10-b00d-45a8-aef2-f50ef0c788f5'::uuid,'ENT-0011',NULL,'2025-10-20'::date,NULL,'FAC-0026','05035DS4974')
  ) AS t(id,number,booking_number,reference_date,inspection_number,invoice_number,serial_number)
  LOOP
    -- Match the operational lock order: booking, delivery, then equipment.
    SELECT * INTO STRICT d FROM public.deliveries WHERE id=target.id AND organization_id=org;
    IF d.booking_id IS NOT NULL THEN
      SELECT * INTO STRICT b FROM public.bookings WHERE id=d.booking_id AND organization_id=org FOR SHARE;
    END IF;
    SELECT * INTO STRICT d FROM public.deliveries WHERE id=target.id AND organization_id=org FOR UPDATE;
    IF d.delivery_number IS DISTINCT FROM target.number OR d.status IS DISTINCT FROM 'scheduled' OR d.type IS DISTINCT FROM 'delivery'
       OR d.completed_at IS NOT NULL OR NULLIF(d.signature_base64,'') IS NOT NULL THEN
      RAISE EXCEPTION 'Delivery precondition changed: %',target.number;
    END IF;
    SELECT * INTO STRICT f FROM public.forklifts WHERE id=d.forklift_id AND organization_id=org FOR SHARE;
    IF target.booking_number IS NOT NULL THEN
      SELECT * INTO STRICT b FROM public.bookings WHERE id=d.booking_id AND organization_id=org FOR SHARE;
      IF b.booking_number IS DISTINCT FROM target.booking_number OR b.status IS DISTINCT FROM 'completed'
         OR b.forklift_id IS DISTINCT FROM f.id OR b.start_date IS DISTINCT FROM target.reference_date THEN
        RAISE EXCEPTION 'Booking precondition changed: %',target.number;
      END IF;
      IF target.inspection_number IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.return_inspections r WHERE r.booking_id=b.id AND r.forklift_id=f.id
          AND r.organization_id=org AND r.inspection_number=target.inspection_number) THEN
        RAISE EXCEPTION 'Return evidence missing: %',target.number;
      END IF;
      IF target.inspection_number IS NULL AND EXISTS (
        SELECT 1 FROM public.return_inspections r WHERE r.booking_id=b.id AND r.organization_id=org) THEN
        RAISE EXCEPTION 'New return evidence requires review: %',target.number;
      END IF;
      cls := 'closed_rental'; basis := 'booking_start_authorized';
      why := 'Reserva concluida conciliada administrativamente; fecha de referencia autorizada = inicio de reserva, no firma ni hora real reconstruida.';
      ev := jsonb_build_object('kind', CASE WHEN target.inspection_number IS NULL THEN 'booking_closed' ELSE 'return_inspection' END,
        'description', CASE WHEN target.inspection_number IS NULL THEN 'Reserva cerrada administrativamente; sin devolución registrada.'
         ELSE 'Devolución ' || target.inspection_number || ' registrada; fecha de referencia = inicio de reserva autorizado.' END);
    ELSE
      SELECT * INTO STRICT i FROM public.invoices WHERE invoice_number=target.invoice_number AND organization_id=org FOR SHARE;
      IF d.booking_id IS NOT NULL OR f.status IS DISTINCT FROM 'sold' OR f.serial_number IS DISTINCT FROM target.serial_number
         OR i.issued_at IS DISTINCT FROM target.reference_date OR NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(i.line_items) li
             WHERE li->>'description' LIKE '%' || target.serial_number || '%'
               AND li->>'description' LIKE '%' || f.name || '%'
               AND li->>'description' ILIKE '%Venta de equipo%')
         OR NOT EXISTS (SELECT 1 FROM public.quotes q WHERE q.id=i.quote_id AND q.organization_id=org AND q.quote_type='sale') THEN
        RAISE EXCEPTION 'Sale evidence changed: %',target.number;
      END IF;
      cls := 'equipment_sale'; basis := 'sale_invoice_issued_authorized';
      why := 'Transporte por venta confirmado por el usuario; fecha de referencia = fecha de factura de venta indicada por el usuario, sin firma ni hora real reconstruida.';
      ev := jsonb_build_object('kind','sale_invoice_and_user_confirmation',
        'description','Venta y fecha confirmadas por el usuario con referencia a la factura de venta.');
    END IF;
    INSERT INTO public.delivery_historical_reconciliations
      (delivery_id,organization_id,classification,reference_date,date_basis,evidence,reason,authorization_source)
    VALUES (d.id,org,cls,target.reference_date,basis,ev,why,auth_source)
    ON CONFLICT (delivery_id) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.delivery_historical_reconciliations h WHERE h.delivery_id=d.id
      AND h.organization_id=org AND h.classification=cls AND h.reference_date=target.reference_date
      AND h.date_basis=basis AND h.evidence=ev AND h.reason=why AND h.authorization_source=auth_source
      AND h.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'Existing reconciliation differs: %',target.number;
    END IF;
  END LOOP;
  SELECT jsonb_build_object(
    'deliveries', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM public.deliveries x WHERE organization_id=org),
    'bookings', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM public.bookings x WHERE organization_id=org),
    'forklifts', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM public.forklifts x WHERE organization_id=org),
    'payments', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM public.payments x WHERE organization_id=org),
    'invoice_bookings', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY invoice_id,booking_id,line_index)::text,'[]')) FROM public.invoice_bookings x WHERE organization_id=org),
    'invoices', (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM public.invoices x WHERE organization_id=org)
  ) INTO after_state;
  IF before_state IS DISTINCT FROM after_state THEN RAISE EXCEPTION 'Protected data changed; rolling back'; END IF;
END $$;
COMMIT;
