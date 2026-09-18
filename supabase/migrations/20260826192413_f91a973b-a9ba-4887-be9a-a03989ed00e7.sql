DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.set_feedback_reporter_type()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.set_feedback_reporter_type() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.validate_payment_intent_amount()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.validate_payment_intent_amount() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
