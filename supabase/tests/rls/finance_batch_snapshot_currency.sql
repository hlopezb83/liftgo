-- Offline-only RLS regression: persisted layouts, tenant isolation, cancellation,
-- payment guards and bank currency. Every fixture is rolled back.
BEGIN;

DO $setup$
DECLARE
  v_org uuid;
  v_admin uuid;
  v_supplier uuid;
  v_bill uuid;
BEGIN
  INSERT INTO public.organizations(id, name, slug) VALUES
    ('85000000-0000-4000-8000-0000000000a0', 'Finance suite A', 'finance-snapshot-a'),
    ('85000000-0000-4000-8000-0000000000b0', 'Finance suite B', 'finance-snapshot-b');
  FOR v_org, v_admin, v_supplier, v_bill IN VALUES
    ('85000000-0000-4000-8000-0000000000a0'::uuid, '85000000-0000-4000-8000-0000000000a1'::uuid, '85000000-0000-4000-8000-0000000000a2'::uuid, '85000000-0000-4000-8000-0000000000a4'::uuid),
    ('85000000-0000-4000-8000-0000000000b0'::uuid, '85000000-0000-4000-8000-0000000000b1'::uuid, '85000000-0000-4000-8000-0000000000b2'::uuid, '85000000-0000-4000-8000-0000000000b4'::uuid)
  LOOP
    PERFORM set_config('app.organization_id', v_org::text, true);
    INSERT INTO auth.users(id, email, created_at, updated_at)
    VALUES (v_admin, v_admin::text || '@finance.rls.test', now(), now());
    INSERT INTO public.organization_memberships(organization_id, auth_user_id, member_type)
    VALUES(v_org, v_admin, 'internal');
    INSERT INTO public.user_roles(user_id, role) VALUES(v_admin, 'admin')
    ON CONFLICT(user_id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.suppliers(id, name, organization_id) VALUES(v_supplier, 'Refacciones suite', v_org);
    INSERT INTO public.supplier_bank_accounts(supplier_id, bank_name, account_holder, clabe, is_primary, organization_id)
    VALUES(v_supplier, 'Banco original', 'Titular original', '012345678901234568', true, v_org);
    PERFORM set_config('app.cxp_rpc', 'on', true);
    INSERT INTO public.supplier_bills(id, supplier_id, bill_number, subtotal, tax_amount, total, status, approval_status, organization_id)
    VALUES(v_bill, v_supplier, 'CXP-SUITE-0001', 100, 16, 116, 'pending', 'not_required', v_org);
    PERFORM set_config('app.cxp_rpc', 'off', true);
  END LOOP;

  PERFORM set_config('app.organization_id', '85000000-0000-4000-8000-0000000000a0', true);
  INSERT INTO auth.users(id, email, created_at, updated_at)
  VALUES ('85000000-0000-4000-8000-0000000000aa', 'auditor@finance.rls.test', now(), now());
  INSERT INTO public.organization_memberships(organization_id, auth_user_id, member_type)
  VALUES ('85000000-0000-4000-8000-0000000000a0', '85000000-0000-4000-8000-0000000000aa', 'internal');
  INSERT INTO public.user_roles(user_id, role) VALUES('85000000-0000-4000-8000-0000000000aa', 'auditor')
  ON CONFLICT(user_id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO auth.users(id, email, created_at, updated_at)
  VALUES ('85000000-0000-4000-8000-0000000000ad', 'administrativo@finance.rls.test', now(), now());
  INSERT INTO public.organization_memberships(organization_id, auth_user_id, member_type)
  VALUES ('85000000-0000-4000-8000-0000000000a0', '85000000-0000-4000-8000-0000000000ad', 'internal');
  INSERT INTO public.user_roles(user_id, role) VALUES('85000000-0000-4000-8000-0000000000ad', 'administrativo')
  ON CONFLICT(user_id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.bank_accounts(id, name, bank, currency, organization_id)
  VALUES('85000000-0000-4000-8000-0000000000a7', 'Banco suite A', 'BBVA', 'MXN', '85000000-0000-4000-8000-0000000000a0');
  PERFORM set_config('app.cxp_rpc', 'on', true);
  INSERT INTO public.supplier_bills(id, supplier_id, bill_number, subtotal, tax_amount, total, currency, exchange_rate, status, approval_status, organization_id)
  VALUES('85000000-0000-4000-8000-0000000000a5', '85000000-0000-4000-8000-0000000000a2', 'CXP-SUITE-0002', 100, 16, 116, 'USD', 20, 'pending', 'not_required', '85000000-0000-4000-8000-0000000000a0');
  PERFORM set_config('app.cxp_rpc', 'off', true);

  PERFORM set_config('app.organization_id', '85000000-0000-4000-8000-0000000000b0', true);
  INSERT INTO public.supplier_payment_batches(id, organization_id, total_amount, bill_count)
  VALUES('85000000-0000-4000-8000-0000000000b6', '85000000-0000-4000-8000-0000000000b0', 5, 1);
  INSERT INTO public.supplier_payment_batch_items(batch_id, bill_id, supplier_name, bank_name, clabe, account_holder, bill_number, reference, amount, organization_id)
  VALUES('85000000-0000-4000-8000-0000000000b6', '85000000-0000-4000-8000-0000000000b4', 'Refacciones B', 'Banco B', '012345678901234568', 'Titular B', 'CXP-SUITE-0001', 'B-REF', 5, '85000000-0000-4000-8000-0000000000b0');
  PERFORM set_config('app.organization_id', '85000000-0000-4000-8000-0000000000a0', true);
END;
$setup$;

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"85000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $snapshot$
DECLARE
  v_batch uuid;
  v_snapshot jsonb;
  v_page jsonb;
  v_blocked boolean;
BEGIN
  v_batch := public.create_supplier_payment_batch(
    '[{"bill_id":"85000000-0000-4000-8000-0000000000a4","amount":50},{"bill_id":"85000000-0000-4000-8000-0000000000a5","amount":5}]'::jsonb,
    'Snapshot suite'
  );
  PERFORM set_config('test.finance_batch_old', v_batch::text, true);
  v_snapshot := public.get_supplier_payment_batch_snapshot(v_batch);
  IF jsonb_array_length(v_snapshot->'items') <> 2
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_snapshot->'items') i
                    WHERE i->>'bank_name' = 'Banco original' AND (i->>'amount')::numeric = 50) THEN
    RAISE EXCEPTION 'Snapshot does not match the persisted layout';
  END IF;

  -- Real supplier change after the batch; the original snapshot must remain.
  UPDATE public.supplier_bank_accounts SET bank_name = 'Banco actualizado', account_holder = 'Titular actualizado'
   WHERE supplier_id = '85000000-0000-4000-8000-0000000000a2';
  UPDATE public.suppliers SET name = 'Nombre actualizado' WHERE id = '85000000-0000-4000-8000-0000000000a2';
  IF public.get_supplier_payment_batch_snapshot(v_batch) IS DISTINCT FROM v_snapshot THEN
    RAISE EXCEPTION 'Redownload changed when current supplier details changed';
  END IF;

  v_page := public.get_supplier_payment_batches_page(20, 0);
  IF (v_page->>'total_count')::int <> 1 OR jsonb_array_length(v_page->'items') <> 1
     OR jsonb_array_length(v_page->'items'->0->'totals_by_currency') <> 2 THEN
    RAISE EXCEPTION 'History leaked another organization or combined currencies';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_page->'items'->0->'totals_by_currency') t
                  WHERE t->>'currency' = 'MXN' AND (t->>'total')::numeric = 50)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_page->'items'->0->'totals_by_currency') t
                  WHERE t->>'currency' = 'USD' AND (t->>'total')::numeric = 5) THEN
    RAISE EXCEPTION 'History totals did not preserve individual currencies';
  END IF;

  v_blocked := false;
  BEGIN PERFORM public.get_supplier_payment_batch_snapshot('85000000-0000-4000-8000-0000000000b6');
  EXCEPTION WHEN no_data_found THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Tenant A read tenant B snapshot'; END IF;
  v_blocked := false;
  BEGIN PERFORM public.cancel_supplier_payment_batch('85000000-0000-4000-8000-0000000000b6');
  EXCEPTION WHEN no_data_found THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Tenant A cancelled tenant B batch'; END IF;
END;
$snapshot$;

-- Simulate a legitimate later reservation after an older batch was released.
-- This is isolated SQL fixture setup, never a production mutation.
RESET ROLE;
DO $new_reservation$
DECLARE v_later timestamptz := now() + interval '1 minute';
BEGIN
  INSERT INTO public.supplier_payment_batches(id, created_at, organization_id, total_amount, bill_count)
  VALUES('85000000-0000-4000-8000-0000000000a6', v_later, '85000000-0000-4000-8000-0000000000a0', 10, 1);
  INSERT INTO public.supplier_payment_batch_items(batch_id, bill_id, supplier_name, bank_name, clabe, account_holder, bill_number, reference, amount, organization_id)
  VALUES('85000000-0000-4000-8000-0000000000a6', '85000000-0000-4000-8000-0000000000a4', 'Actualizado', 'Banco posterior', '012345678901234568', 'Titular posterior', 'CXP-SUITE-0001', 'NEW-REF', 10, '85000000-0000-4000-8000-0000000000a0');
  UPDATE public.supplier_bills SET payment_in_progress_at = v_later
   WHERE id = '85000000-0000-4000-8000-0000000000a4';
END;
$new_reservation$;
SET LOCAL role = authenticated;

DO $cancellation$
DECLARE
  v_old uuid := current_setting('test.finance_batch_old')::uuid;
  v_snapshot jsonb;
  v_cancelled_at timestamptz;
  v_payment uuid;
  v_manual_batch uuid;
  v_manual_balance numeric;
  v_blocked boolean;
  v_message text;
BEGIN
  v_snapshot := public.get_supplier_payment_batch_snapshot(v_old);
  PERFORM public.cancel_supplier_payment_batch(v_old);
  SELECT cancelled_at INTO v_cancelled_at FROM public.supplier_payment_batches WHERE id = v_old;
  IF v_cancelled_at IS NULL THEN RAISE EXCEPTION 'Cancellation did not remain in history'; END IF;
  IF (public.get_supplier_payment_batch_snapshot(v_old)->'items') IS DISTINCT FROM (v_snapshot->'items') THEN
    RAISE EXCEPTION 'Cancellation rewrote the original snapshot';
  END IF;
  IF (SELECT payment_in_progress_at FROM public.supplier_bills
       WHERE id = '85000000-0000-4000-8000-0000000000a4') IS DISTINCT FROM now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Cancelling the old batch cleared a newer reservation';
  END IF;
  IF (SELECT payment_in_progress_at FROM public.supplier_bills
       WHERE id = '85000000-0000-4000-8000-0000000000a5') IS NOT NULL THEN
    RAISE EXCEPTION 'Cancellation did not release its own reservation';
  END IF;
  PERFORM public.cancel_supplier_payment_batch(v_old);
  IF (SELECT cancelled_at FROM public.supplier_payment_batches WHERE id = v_old) IS DISTINCT FROM v_cancelled_at THEN
    RAISE EXCEPTION 'Cancellation is not idempotent';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO public.supplier_payments(bill_id, amount, payment_date, batch_id, organization_id)
    VALUES('85000000-0000-4000-8000-0000000000a5', 1, current_date, v_old, '85000000-0000-4000-8000-0000000000a0');
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    v_blocked := v_message LIKE '%cancelado%';
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Direct payment accepted a cancelled batch'; END IF;

  -- Explicit NULL remains manual even when this bill belongs to an active batch.
  v_manual_batch := public.create_supplier_payment_batch(
    '[{"bill_id":"85000000-0000-4000-8000-0000000000a5","amount":50}]'::jsonb,
    'Manual payment remains independent');
  IF (SELECT cancelled_at FROM public.supplier_payment_batches WHERE id = v_manual_batch) IS NOT NULL THEN
    RAISE EXCEPTION 'Manual payment fixture requires an active batch';
  END IF;
  v_payment := public.register_supplier_payment('85000000-0000-4000-8000-0000000000a5',
    1, current_date, 'transfer', NULL, NULL, NULL, NULL, NULL::uuid);
  IF (SELECT batch_id FROM public.supplier_payments WHERE id = v_payment) IS NOT NULL THEN
    RAISE EXCEPTION 'Manual payment was auto-linked to an active batch';
  END IF;
  SELECT balance INTO v_manual_balance FROM public.supplier_bills
   WHERE id = '85000000-0000-4000-8000-0000000000a5';
  IF v_manual_balance IS DISTINCT FROM 115::numeric THEN
    RAISE EXCEPTION 'Manual payment did not reduce the balance from 116 to 115';
  END IF;
  PERFORM public.cancel_supplier_payment_batch(v_manual_batch);
  IF (SELECT cancelled_at FROM public.supplier_payment_batches WHERE id = v_manual_batch) IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.supplier_payments
                     WHERE id = v_payment AND amount = 1 AND batch_id IS NULL)
     OR (SELECT balance FROM public.supplier_bills
          WHERE id = '85000000-0000-4000-8000-0000000000a5') IS DISTINCT FROM v_manual_balance THEN
    RAISE EXCEPTION 'Batch cancellation did not preserve the independent manual payment and balance';
  END IF;

  v_payment := public.register_supplier_payment('85000000-0000-4000-8000-0000000000a4',
    10, current_date, 'transfer', NULL, NULL, NULL, NULL, '85000000-0000-4000-8000-0000000000a6'::uuid);
  v_blocked := false;
  BEGIN PERFORM public.cancel_supplier_payment_batch('85000000-0000-4000-8000-0000000000a6');
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked OR (SELECT cancelled_at FROM public.supplier_payment_batches
                       WHERE id = '85000000-0000-4000-8000-0000000000a6') IS NOT NULL THEN
    RAISE EXCEPTION 'Cancellation accepted a batch with registered payments';
  END IF;
END;
$cancellation$;

DO $currency$
DECLARE v_blocked boolean := false;
BEGIN
  -- A verified account without history remains editable.
  UPDATE public.bank_accounts SET currency = 'USD' WHERE id = '85000000-0000-4000-8000-0000000000a7';
  UPDATE public.bank_accounts SET currency = 'MXN' WHERE id = '85000000-0000-4000-8000-0000000000a7';
  INSERT INTO public.bank_statement_imports(id, bank_account_id, file_name, organization_id)
  VALUES('85000000-0000-4000-8000-0000000000a8', '85000000-0000-4000-8000-0000000000a7', 'suite.csv', '85000000-0000-4000-8000-0000000000a0');
  INSERT INTO public.bank_statement_lines(import_id, bank_account_id, posted_date, description, signed_amount, hash, organization_id)
  VALUES('85000000-0000-4000-8000-0000000000a8', '85000000-0000-4000-8000-0000000000a7', current_date, 'Comisión suite', -185.60, 'finance-currency-suite', '85000000-0000-4000-8000-0000000000a0');
  BEGIN UPDATE public.bank_accounts SET currency = 'USD' WHERE id = '85000000-0000-4000-8000-0000000000a7';
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked OR (SELECT currency FROM public.bank_accounts WHERE id = '85000000-0000-4000-8000-0000000000a7') <> 'MXN' THEN
    RAISE EXCEPTION 'Bank currency changed after statement import';
  END IF;
  -- Editing an unrelated field must still work after history is imported.
  UPDATE public.bank_accounts SET name = 'Banco suite renombrado' WHERE id = '85000000-0000-4000-8000-0000000000a7';
END;
$currency$;

-- An active Administrative member retains access, then a disabled profile
-- must lose it immediately even though their JWT and membership remain valid.
SET LOCAL request.jwt.claims TO '{"sub":"85000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
DO $administrative_active$
BEGIN
  PERFORM public.get_supplier_payment_batches_page(20, 0);
  PERFORM public.get_supplier_payment_batch_snapshot(current_setting('test.finance_batch_old')::uuid);
END;
$administrative_active$;
RESET ROLE;
UPDATE public.profiles SET is_active = false WHERE user_id = '85000000-0000-4000-8000-0000000000ad';
SET LOCAL role = authenticated;
DO $disabled_member$
DECLARE v_blocked boolean;
BEGIN
  v_blocked := false;
  BEGIN PERFORM public.get_supplier_payment_batches_page(20, 0);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Disabled member read batch history'; END IF;
  v_blocked := false;
  BEGIN PERFORM public.get_supplier_payment_batch_snapshot(current_setting('test.finance_batch_old')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Disabled member read banking snapshot'; END IF;
  v_blocked := false;
  BEGIN PERFORM public.cancel_supplier_payment_batch(current_setting('test.finance_batch_old')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Disabled member cancelled a batch'; END IF;
  v_blocked := false;
  BEGIN PERFORM public.register_supplier_payment('85000000-0000-4000-8000-0000000000a5',
    1, current_date, 'transfer', NULL, NULL, NULL, NULL, NULL::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Disabled member registered a payment'; END IF;
END;
$disabled_member$;

SET LOCAL request.jwt.claims TO '{"sub":"85000000-0000-4000-8000-0000000000aa","role":"authenticated"}';
DO $auditor$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN PERFORM public.get_supplier_payment_batches_page(20, 0);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Auditor gained access to bank layouts'; END IF;
END;
$auditor$;

RESET ROLE;
SET LOCAL role = anon;
SET LOCAL request.jwt.claims TO '{"role":"anon"}';
DO $anonymous$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN PERFORM public.get_supplier_payment_batch_snapshot(current_setting('test.finance_batch_old')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Anonymous read a banking snapshot'; END IF;
END;
$anonymous$;

RESET ROLE;
DO $tenant_b_unchanged$
BEGIN
  IF (SELECT cancelled_at FROM public.supplier_payment_batches WHERE id = '85000000-0000-4000-8000-0000000000b6') IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public.supplier_payment_batch_items WHERE batch_id = '85000000-0000-4000-8000-0000000000b6') THEN
    RAISE EXCEPTION 'Tenant B history changed during tenant A audit';
  END IF;
END;
$tenant_b_unchanged$;
ROLLBACK;
