-- BL-43: webhook_events (bitácora append-only de eventos externos)
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processed','failed','duplicate')),
  error_message text,
  CONSTRAINT webhook_events_provider_event_unique UNIQUE (provider, event_id)
);

CREATE INDEX webhook_events_provider_status_idx
  ON public.webhook_events (provider, status);
CREATE INDEX webhook_events_received_at_idx
  ON public.webhook_events (received_at DESC);

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read webhook events"
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Sin políticas de INSERT/UPDATE/DELETE: solo service_role escribe.

-- BL-44: cfdi_retry_queue (cola de reintentos para operaciones CFDI)
CREATE TABLE public.cfdi_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL
    CHECK (operation IN ('stamp','cancel','cancel_nc','cancel_rep')),
  invoice_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','succeeded','exhausted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cfdi_retry_queue_pending_idx
  ON public.cfdi_retry_queue (status, next_retry_at)
  WHERE status = 'pending';
CREATE INDEX cfdi_retry_queue_invoice_idx
  ON public.cfdi_retry_queue (invoice_id);

GRANT SELECT ON public.cfdi_retry_queue TO authenticated;
GRANT ALL ON public.cfdi_retry_queue TO service_role;

ALTER TABLE public.cfdi_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read cfdi retry queue"
  ON public.cfdi_retry_queue FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  );

-- Trigger updated_at
CREATE TRIGGER cfdi_retry_queue_set_updated_at
  BEFORE UPDATE ON public.cfdi_retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
