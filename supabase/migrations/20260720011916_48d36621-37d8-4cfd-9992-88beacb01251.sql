
-- =========================================================================
-- collection_reminders_log
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.collection_reminders_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipient_email text NOT NULL,
  email_status text DEFAULT 'sent',
  error_message text
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_reminders_log_invoice_id_reminder_type_key
  ON public.collection_reminders_log (invoice_id, reminder_type);

CREATE INDEX IF NOT EXISTS idx_collection_reminders_invoice
  ON public.collection_reminders_log (invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_reminders_log TO authenticated;
GRANT ALL ON public.collection_reminders_log TO service_role;

ALTER TABLE public.collection_reminders_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view collection reminders" ON public.collection_reminders_log;
CREATE POLICY "Admins view collection reminders"
  ON public.collection_reminders_log
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
  );

DROP POLICY IF EXISTS "Auditors view collection reminders" ON public.collection_reminders_log;
CREATE POLICY "Auditors view collection reminders"
  ON public.collection_reminders_log
  FOR SELECT
  USING (has_role(auth.uid(), 'auditor'::app_role));

-- =========================================================================
-- Funciones de notificación (idempotentes, iguales al ambiente en prod)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid, p_type text, p_title text,
  p_message text DEFAULT NULL,
  p_link text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, link, entity_type, entity_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_entity_type, p_entity_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admins(
  p_type text, p_title text,
  p_message text DEFAULT NULL,
  p_link text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
  v_user record;
BEGIN
  FOR v_user IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'administrativo')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, link, entity_type, entity_id)
    VALUES (v_user.user_id, p_type, p_title, p_message, p_link, p_entity_type, p_entity_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_payment_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_invoice record;
BEGIN
  SELECT invoice_number, customer_name INTO v_invoice
  FROM public.invoices WHERE id = NEW.invoice_id;

  PERFORM public.notify_admins(
    'payment_received',
    'Pago recibido',
    'Se registró un pago de $' || to_char(NEW.amount, 'FM999,999,990.00') || ' MXN para la factura ' || COALESCE(v_invoice.invoice_number, '') || ' (' || COALESCE(v_invoice.customer_name, 'Cliente') || ')',
    '/invoices/' || NEW.invoice_id,
    'invoice',
    NEW.invoice_id
  );
  RETURN NEW;
END;
$$;

-- Bloquear ejecución anónima (consistente con REVOKEs originales)
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_payment_received() FROM PUBLIC, anon;
