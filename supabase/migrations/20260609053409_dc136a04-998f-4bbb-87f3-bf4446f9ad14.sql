
-- 1. bank_accounts
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bank text NOT NULL,
  last4 text,
  currency text NOT NULL DEFAULT 'MXN',
  initial_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_accounts read" ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
  );

CREATE POLICY "bank_accounts write admin/administrativo" ON public.bank_accounts
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  );

CREATE TRIGGER trg_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. bank_statement_imports
CREATE TABLE public.bank_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  period_start date,
  period_end date,
  lines_count integer NOT NULL DEFAULT 0,
  imported_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_imports TO authenticated;
GRANT ALL ON public.bank_statement_imports TO service_role;
ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_statement_imports read" ON public.bank_statement_imports
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
  );

CREATE POLICY "bank_statement_imports write" ON public.bank_statement_imports
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  );

-- 3. bank_statement_lines
CREATE TYPE public.bank_line_status AS ENUM ('unmatched', 'suggested', 'matched', 'ignored');

CREATE TABLE public.bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.bank_statement_imports(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  posted_date date NOT NULL,
  description text NOT NULL DEFAULT '',
  signed_amount numeric NOT NULL,
  reference text,
  hash text NOT NULL,
  status public.bank_line_status NOT NULL DEFAULT 'unmatched',
  matched_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  matched_supplier_payment_id uuid REFERENCES public.supplier_payments(id) ON DELETE SET NULL,
  suggested_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  suggested_supplier_payment_id uuid REFERENCES public.supplier_payments(id) ON DELETE SET NULL,
  match_score integer,
  matched_at timestamptz,
  matched_by uuid REFERENCES auth.users(id),
  ignored_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_lines TO authenticated;
GRANT ALL ON public.bank_statement_lines TO service_role;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX bank_statement_lines_account_hash_uq
  ON public.bank_statement_lines(bank_account_id, hash);
CREATE INDEX bank_statement_lines_account_status_idx
  ON public.bank_statement_lines(bank_account_id, status, posted_date);

CREATE POLICY "bank_statement_lines read" ON public.bank_statement_lines
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
  );

CREATE POLICY "bank_statement_lines write" ON public.bank_statement_lines
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  );

CREATE TRIGGER trg_bank_statement_lines_updated_at
  BEFORE UPDATE ON public.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RPC match_bank_statement_lines
CREATE OR REPLACE FUNCTION public.match_bank_statement_lines(p_import_id uuid)
RETURNS TABLE (matched_count integer, suggested_count integer, unmatched_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matched int := 0;
  v_suggested int := 0;
  v_unmatched int := 0;
  v_line record;
  v_best record;
  v_score int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_line IN
    SELECT * FROM public.bank_statement_lines
    WHERE import_id = p_import_id AND status = 'unmatched'
  LOOP
    v_best := NULL;
    v_score := 0;

    IF v_line.signed_amount < 0 THEN
      -- Egreso: buscar en supplier_payments
      SELECT sp.id AS pid,
             60
             + GREATEST(0, 25 - ABS(sp.payment_date - v_line.posted_date) * 8)
             + CASE WHEN v_line.reference IS NOT NULL AND sp.reference IS NOT NULL
                      AND position(lower(sp.reference) IN lower(coalesce(v_line.description,'') || ' ' || coalesce(v_line.reference,''))) > 0
                    THEN 15 ELSE 0 END AS score,
             count(*) OVER () AS total
        INTO v_best
        FROM public.supplier_payments sp
        WHERE abs(sp.amount - abs(v_line.signed_amount)) < 0.01
          AND abs(sp.payment_date - v_line.posted_date) <= 3
          AND NOT EXISTS (
            SELECT 1 FROM public.bank_statement_lines bsl
            WHERE bsl.matched_supplier_payment_id = sp.id
          )
        ORDER BY ABS(sp.payment_date - v_line.posted_date) ASC
        LIMIT 1;

      IF v_best.pid IS NOT NULL THEN
        IF v_best.total = 1 THEN
          UPDATE public.bank_statement_lines
             SET status = 'matched',
                 matched_supplier_payment_id = v_best.pid,
                 match_score = v_best.score,
                 matched_at = now(),
                 matched_by = auth.uid()
           WHERE id = v_line.id;
          v_matched := v_matched + 1;
        ELSE
          UPDATE public.bank_statement_lines
             SET status = 'suggested',
                 suggested_supplier_payment_id = v_best.pid,
                 match_score = v_best.score
           WHERE id = v_line.id;
          v_suggested := v_suggested + 1;
        END IF;
      ELSE
        v_unmatched := v_unmatched + 1;
      END IF;
    ELSE
      -- Ingreso: buscar en payments (cobros)
      SELECT p.id AS pid,
             60
             + GREATEST(0, 25 - ABS(p.payment_date - v_line.posted_date) * 8)
             + CASE WHEN v_line.reference IS NOT NULL AND p.reference_number IS NOT NULL
                      AND position(lower(p.reference_number) IN lower(coalesce(v_line.description,'') || ' ' || coalesce(v_line.reference,''))) > 0
                    THEN 15 ELSE 0 END AS score,
             count(*) OVER () AS total
        INTO v_best
        FROM public.payments p
        WHERE abs(p.amount - v_line.signed_amount) < 0.01
          AND abs(p.payment_date - v_line.posted_date) <= 3
          AND NOT EXISTS (
            SELECT 1 FROM public.bank_statement_lines bsl
            WHERE bsl.matched_payment_id = p.id
          )
        ORDER BY ABS(p.payment_date - v_line.posted_date) ASC
        LIMIT 1;

      IF v_best.pid IS NOT NULL THEN
        IF v_best.total = 1 THEN
          UPDATE public.bank_statement_lines
             SET status = 'matched',
                 matched_payment_id = v_best.pid,
                 match_score = v_best.score,
                 matched_at = now(),
                 matched_by = auth.uid()
           WHERE id = v_line.id;
          v_matched := v_matched + 1;
        ELSE
          UPDATE public.bank_statement_lines
             SET status = 'suggested',
                 suggested_payment_id = v_best.pid,
                 match_score = v_best.score
           WHERE id = v_line.id;
          v_suggested := v_suggested + 1;
        END IF;
      ELSE
        v_unmatched := v_unmatched + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_matched, v_suggested, v_unmatched;
END;
$$;

REVOKE ALL ON FUNCTION public.match_bank_statement_lines(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_bank_statement_lines(uuid) TO authenticated;

-- 5. RPC confirm_bank_match
CREATE OR REPLACE FUNCTION public.confirm_bank_match(
  p_line_id uuid,
  p_payment_id uuid DEFAULT NULL,
  p_supplier_payment_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF (p_payment_id IS NULL AND p_supplier_payment_id IS NULL)
     OR (p_payment_id IS NOT NULL AND p_supplier_payment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'debe enviarse exactamente un pago';
  END IF;
  UPDATE public.bank_statement_lines
     SET status = 'matched',
         matched_payment_id = p_payment_id,
         matched_supplier_payment_id = p_supplier_payment_id,
         suggested_payment_id = NULL,
         suggested_supplier_payment_id = NULL,
         matched_at = now(),
         matched_by = auth.uid()
   WHERE id = p_line_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_bank_match(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_bank_match(uuid, uuid, uuid) TO authenticated;

-- 6. RPC unmatch_bank_line
CREATE OR REPLACE FUNCTION public.unmatch_bank_line(p_line_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.bank_statement_lines
     SET status = 'unmatched',
         matched_payment_id = NULL,
         matched_supplier_payment_id = NULL,
         suggested_payment_id = NULL,
         suggested_supplier_payment_id = NULL,
         match_score = NULL,
         matched_at = NULL,
         matched_by = NULL,
         ignored_reason = NULL
   WHERE id = p_line_id;
END;
$$;

REVOKE ALL ON FUNCTION public.unmatch_bank_line(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unmatch_bank_line(uuid) TO authenticated;
