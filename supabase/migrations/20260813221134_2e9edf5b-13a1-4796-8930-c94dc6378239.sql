-- 1) public.notifications: existe en producción pero ninguna migración la crea.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  link text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $lgp$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'notifications'
                    AND policyname = 'Users see their own notifications') THEN
    EXECUTE 'CREATE POLICY "Users see their own notifications" ON public.notifications
             FOR SELECT TO authenticated USING ((select auth.uid()) = user_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'notifications'
                    AND policyname = 'Users update their own notifications') THEN
    EXECUTE 'CREATE POLICY "Users update their own notifications" ON public.notifications
             FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'notifications'
                    AND policyname = 'Users delete their own notifications') THEN
    EXECUTE 'CREATE POLICY "Users delete their own notifications" ON public.notifications
             FOR DELETE TO authenticated USING ((select auth.uid()) = user_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'notifications'
                    AND policyname = 'Admins can insert notifications') THEN
    EXECUTE 'CREATE POLICY "Admins can insert notifications" ON public.notifications
             FOR INSERT TO authenticated
             WITH CHECK ((select public.is_admin_or_administrativo()))';
  END IF;
END
$lgp$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);

-- 2) trg_validate_transition sobre deliveries: la máquina de estados ya no
-- aplica a entregas (v7.28x). En una base reconstruida desde cero el orden de
-- las migraciones lo revive y bloquea el alta normal ('scheduled').
DROP TRIGGER IF EXISTS trg_validate_transition ON public.deliveries;
