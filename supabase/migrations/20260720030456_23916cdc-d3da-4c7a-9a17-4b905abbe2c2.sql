
-- PL-08 (DRIFT-01) — Backfill idempotente
-- 1) collection_reminders_log
CREATE TABLE IF NOT EXISTS public.collection_reminders_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  reminder_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipient_email text NOT NULL,
  email_status text DEFAULT 'sent',
  error_message text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collection_reminders_log_invoice_id_reminder_type_key'
  ) THEN
    ALTER TABLE public.collection_reminders_log
      ADD CONSTRAINT collection_reminders_log_invoice_id_reminder_type_key
      UNIQUE (invoice_id, reminder_type);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_collection_reminders_invoice
  ON public.collection_reminders_log(invoice_id);

GRANT SELECT ON public.collection_reminders_log TO authenticated;
GRANT ALL ON public.collection_reminders_log TO service_role;

ALTER TABLE public.collection_reminders_log ENABLE ROW LEVEL SECURITY;
