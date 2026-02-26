
CREATE TABLE public.user_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL DEFAULT '1.0',
  content jsonb NOT NULL DEFAULT '[]',
  generated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_manual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read manual"
  ON public.user_manual FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage manual"
  ON public.user_manual FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'administrativo'))
  );
