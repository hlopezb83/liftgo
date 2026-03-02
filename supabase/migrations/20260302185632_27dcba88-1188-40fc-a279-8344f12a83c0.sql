
-- Table for assigning specific forklifts to sale quote line items
CREATE TABLE public.quote_assigned_forklifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  forklift_id uuid NOT NULL REFERENCES public.forklifts(id) ON DELETE CASCADE,
  line_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_forklift_assignment UNIQUE (forklift_id)
);

-- Enable RLS
ALTER TABLE public.quote_assigned_forklifts ENABLE ROW LEVEL SECURITY;

-- RLS policies following existing pattern
CREATE POLICY "Admins full access quote_assigned_forklifts"
ON public.quote_assigned_forklifts FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access quote_assigned_forklifts"
ON public.quote_assigned_forklifts FOR ALL
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Dispatchers full access quote_assigned_forklifts"
ON public.quote_assigned_forklifts FOR ALL
USING (has_role(auth.uid(), 'dispatcher'::app_role))
WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));

CREATE POLICY "Auditor read quote_assigned_forklifts"
ON public.quote_assigned_forklifts FOR SELECT
USING (has_role(auth.uid(), 'auditor'::app_role));

CREATE POLICY "Mechanics read quote_assigned_forklifts"
ON public.quote_assigned_forklifts FOR SELECT
USING (has_role(auth.uid(), 'mechanic'::app_role));
