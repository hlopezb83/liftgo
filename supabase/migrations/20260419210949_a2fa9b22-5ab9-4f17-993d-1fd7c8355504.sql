-- Tabla de notificaciones in-app
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'payment_received', 'invoice_overdue', 'booking_expiring', 'maintenance_due', 'insurance_expiring', 'reminder_sent', 'general'
  title TEXT NOT NULL,
  message TEXT,
  link TEXT, -- ruta interna a la que dirige el click (ej. /invoices/abc)
  entity_type TEXT, -- 'invoice', 'booking', 'forklift', etc
  entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Cada usuario solo ve sus propias notificaciones
CREATE POLICY "Users see their own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Solo el sistema (service role) puede insertar; bloqueamos inserts directos del cliente
-- Sin embargo permitimos a admin/administrativo crear notificaciones (broadcast)
CREATE POLICY "Admins can insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'administrativo')
);

-- Cada usuario puede marcar como leídas/eliminar SUS propias notificaciones
CREATE POLICY "Users update their own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own notifications"
ON public.notifications FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- Función helper para crear notificaciones (usable desde edge functions o triggers)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, link, entity_type, entity_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_entity_type, p_entity_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Función para notificar a TODOS los admin/administrativo
CREATE OR REPLACE FUNCTION public.notify_admins(
  p_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_user RECORD;
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

-- Tabla de log de recordatorios enviados (para no duplicar envíos)
CREATE TABLE public.collection_reminders_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- 'reminder_3', 'reminder_7', 'reminder_15'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_email TEXT NOT NULL,
  email_status TEXT DEFAULT 'sent', -- 'sent', 'failed'
  error_message TEXT,
  UNIQUE (invoice_id, reminder_type)
);

CREATE INDEX idx_collection_reminders_invoice ON public.collection_reminders_log(invoice_id);

ALTER TABLE public.collection_reminders_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view collection reminders"
ON public.collection_reminders_log FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'administrativo')
);

-- Trigger automático: cuando se registra un pago, notificar a los admins
CREATE OR REPLACE FUNCTION public.notify_payment_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
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

CREATE TRIGGER trg_notify_payment_received
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.notify_payment_received();