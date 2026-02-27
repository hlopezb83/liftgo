
-- Update RLS policy to restrict write to admin only
DROP POLICY IF EXISTS "Admins can manage manual" ON public.user_manual;

CREATE POLICY "Admins can manage manual"
  ON public.user_manual
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
