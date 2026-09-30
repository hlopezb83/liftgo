-- Deleting a bank account must never cascade into canonical statement history.
BEGIN;

DO $check$
DECLARE
  v_table text;
  v_delete_action char;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'bank_statement_imports', 'bank_statement_lines', 'bank_statement_uploads'
  ] LOOP
    SELECT c.confdeltype INTO v_delete_action
    FROM pg_constraint c
    WHERE c.conrelid = format('public.%I', v_table)::regclass
      AND c.conname = v_table || '_bank_account_id_fkey'
      AND c.contype = 'f';

    IF v_delete_action IS DISTINCT FROM 'r' THEN
      RAISE EXCEPTION '% must restrict bank account deletion; found %',
        v_table, COALESCE(v_delete_action::text, 'missing FK');
    END IF;
  END LOOP;
END;
$check$;

ROLLBACK;
