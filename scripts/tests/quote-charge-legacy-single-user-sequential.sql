-- Sequential business rules only. Standalone PostgreSQL disables RLS even after
-- SET ROLE; this file intentionally makes NO RLS/ACL/concurrency claims.
BEGIN;
SET LOCAL request.jwt.claims='{"sub":"12320000-0000-4000-8000-000000000005","role":"authenticated"}';
CREATE FUNCTION pg_temp.single_expect(p_sql text,p_code text DEFAULT '23514') RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_code text;
BEGIN
 BEGIN EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_code=RETURNED_SQLSTATE; END;
 IF v_code IS DISTINCT FROM p_code THEN RAISE EXCEPTION 'Expected %, got % for %',p_code,coalesce(v_code,'success'),p_sql; END IF;
END $$;
CREATE FUNCTION pg_temp.single_review(p_quote integer,p_invoice integer,p_index integer,p_class text,p_key integer,p_quantity numeric DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_q uuid:=('12320000-0000-4000-8000-'||lpad(p_quote::text,12,'0'))::uuid;
 v_i uuid:=('12320000-0000-4000-8000-'||lpad(p_invoice::text,12,'0'))::uuid; v_line jsonb;
BEGIN
 SELECT line_items->p_index INTO v_line FROM invoices WHERE id=v_i;
 RETURN public.reconcile_quote_charge_history(v_q,v_i,p_index,public.quote_charge_line_hash(v_line),p_class,
  CASE WHEN p_class='charge' THEN ('12320000-0000-4000-8000-'||lpad((p_quote+100)::text,12,'0'))::uuid ELSE NULL END,
  CASE WHEN p_class='charge' THEN p_quantity ELSE NULL END,'Synthetic reviewed evidence','Synthetic local immutable evidence',
  ('12320000-0000-4000-8000-'||lpad(p_key::text,12,'0'))::uuid);
END $$;
CREATE FUNCTION pg_temp.single_available(p_quote integer) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.get_quote_charge_availability(ARRAY[('12320000-0000-4000-8000-'||lpad(p_quote::text,12,'0'))::uuid])->'quotes'->0;
$$;
CREATE FUNCTION pg_temp.single_native(p_quote integer,p_invoice integer,p_quantity numeric) RETURNS void LANGUAGE sql AS $$
 INSERT INTO invoices(id,organization_id,customer_id,invoice_number,quote_id,line_items,subtotal,total,moneda)
 VALUES(('12320000-0000-4000-8000-'||lpad(p_invoice::text,12,'0'))::uuid,
  '12320000-0000-4000-8000-000000000001','12320000-0000-4000-8000-000000000003','SYN-NATIVE-'||p_invoice,
  ('12320000-0000-4000-8000-'||lpad(p_quote::text,12,'0'))::uuid,
  jsonb_build_array(jsonb_build_object('description','Synthetic native','line_kind','charge',
   'source_quote_id',('12320000-0000-4000-8000-'||lpad(p_quote::text,12,'0'))::uuid,
   'source_quote_line_id',('12320000-0000-4000-8000-'||lpad((p_quote+100)::text,12,'0'))::uuid,
   'quantity',p_quantity,'unit_price',100,'total',p_quantity*100)),p_quantity*100,p_quantity*100,'MXN');
$$;

SELECT pg_temp.single_expect($s$SELECT pg_temp.single_review(10,30,0,'charge',100,0)$s$);
SELECT pg_temp.single_expect($s$SELECT pg_temp.single_review(10,30,0,'charge',100,-1)$s$);
SELECT pg_temp.single_expect($s$SELECT pg_temp.single_review(10,30,0,'charge',100,'NaN')$s$);
SELECT pg_temp.single_expect($s$SELECT pg_temp.single_review(10,30,0,'charge',100,'Infinity')$s$);
SELECT pg_temp.single_expect($s$SELECT pg_temp.single_review(10,30,0,'charge',100,'-Infinity')$s$);
DO $$ DECLARE v jsonb; v_before text; BEGIN
 IF pg_temp.single_available(10)->>'legacy_review_required' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'History not pending'; END IF;
 SELECT line_items::text INTO v_before FROM invoices WHERE id='12320000-0000-4000-8000-000000000030';
 v:=pg_temp.single_review(10,30,0,'charge',100);
 PERFORM set_config('test.single_review_id',v->>'review_id',true);
 IF v->>'complete' IS DISTINCT FROM 'true' OR pg_temp.single_available(10)#>>'{lines,0,consumed_quantity}' IS DISTINCT FROM '1'
  OR pg_temp.single_available(10)->>'legacy_review_required' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Historical consumption failed'; END IF;
 IF (SELECT line_items::text FROM invoices WHERE id='12320000-0000-4000-8000-000000000030') IS DISTINCT FROM v_before
  OR (SELECT quote_charge_tracking_version FROM invoices WHERE id='12320000-0000-4000-8000-000000000030') IS NOT NULL THEN RAISE EXCEPTION 'Original invoice or marker modified'; END IF;
 IF pg_temp.single_review(10,30,0,'charge',100)->>'already_existed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Request not idempotent'; END IF;
END $$;
SELECT pg_temp.single_expect($s$SELECT pg_temp.single_review(10,30,0,'charge',100,2)$s$);
SELECT pg_temp.single_native(10,40,1);
DO $$ BEGIN IF pg_temp.single_available(10)#>>'{lines,0,consumed_quantity}' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Native+historical consumption wrong'; END IF; END $$;
SELECT pg_temp.single_expect($s$SELECT pg_temp.single_native(10,41,2)$s$);
SELECT pg_temp.single_expect($s$UPDATE invoices SET line_items=jsonb_set(line_items,'{0,quantity}','1.0') WHERE id='12320000-0000-4000-8000-000000000030'$s$);
SELECT pg_temp.single_expect($s$UPDATE invoices SET customer_id='12320000-0000-4000-8000-000000000004' WHERE id='12320000-0000-4000-8000-000000000030'$s$);
SELECT pg_temp.single_expect($s$UPDATE invoices SET moneda='USD' WHERE id='12320000-0000-4000-8000-000000000030'$s$);
SELECT pg_temp.single_expect($s$UPDATE invoices SET quote_id=NULL WHERE id='12320000-0000-4000-8000-000000000030'$s$);
SELECT pg_temp.single_expect($s$UPDATE quotes SET line_items='[]' WHERE id='12320000-0000-4000-8000-000000000010'$s$);
SELECT pg_temp.single_expect($s$UPDATE quotes SET currency='USD' WHERE id='12320000-0000-4000-8000-000000000010'$s$);
SELECT pg_temp.single_expect($s$UPDATE quotes SET customer_id='12320000-0000-4000-8000-000000000004' WHERE id='12320000-0000-4000-8000-000000000010'$s$);
SELECT pg_temp.single_expect($s$UPDATE bookings SET quote_id=NULL WHERE id='12320000-0000-4000-8000-000000000020'$s$);
UPDATE invoices SET notes='Synthetic notes-only edit' WHERE id='12320000-0000-4000-8000-000000000030';
SELECT reverse_quote_charge_history(current_setting('test.single_review_id')::uuid,'Synthetic contrary evidence','Synthetic reversal evidence','12320000-0000-4000-8000-000000000200');
DO $$ BEGIN
 IF pg_temp.single_available(10)->>'legacy_review_required' IS DISTINCT FROM 'true' OR pg_temp.single_available(10)#>>'{lines,0,consumed_quantity}' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Reversal pending/count failed'; END IF;
 IF public.reverse_quote_charge_history(current_setting('test.single_review_id')::uuid,'Synthetic contrary evidence','Synthetic reversal evidence','12320000-0000-4000-8000-000000000200')->>'already_existed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Reversal not idempotent'; END IF;
END $$;
SELECT pg_temp.single_expect($s$UPDATE quote_charge_legacy_reviews SET reason='tampered' WHERE id=current_setting('test.single_review_id')::uuid$s$);
SELECT pg_temp.single_expect($s$DELETE FROM quote_charge_legacy_reversals WHERE review_id=current_setting('test.single_review_id')::uuid$s$);
SELECT pg_temp.single_expect($s$UPDATE invoices SET line_items=jsonb_set(line_items,'{0,quantity}','1.0') WHERE id='12320000-0000-4000-8000-000000000030'$s$);

-- A review for one quote never clears another quote in a multi-quote document.
SELECT pg_temp.single_review(11,31,0,'charge',101);
SELECT pg_temp.single_review(11,31,1,'rental',102);
DO $$ BEGIN
 IF pg_temp.single_available(11)->>'legacy_review_required' IS DISTINCT FROM 'false'
  OR pg_temp.single_available(13)->>'legacy_review_required' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Review scope leaked'; END IF;
END $$;
SELECT pg_temp.single_review(13,31,0,'not_quote_charge',103);
SELECT pg_temp.single_review(13,31,1,'charge',104);
DELETE FROM invoice_bookings WHERE invoice_id='12320000-0000-4000-8000-000000000031';
INSERT INTO invoice_bookings(invoice_id,booking_id,organization_id) VALUES
 ('12320000-0000-4000-8000-000000000031','12320000-0000-4000-8000-000000000021','12320000-0000-4000-8000-000000000001'),
 ('12320000-0000-4000-8000-000000000031','12320000-0000-4000-8000-000000000023','12320000-0000-4000-8000-000000000001');
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.single_expect($s$UPDATE invoices SET line_items=jsonb_build_array(line_items->1,line_items->0) WHERE id='12320000-0000-4000-8000-000000000031'$s$);

-- Rental-only quotes ignore ambiguous history until an additional charge exists.
DO $$ BEGIN IF pg_temp.single_available(12)->>'legacy_review_required' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'No-charge quote blocked'; END IF; END $$;
UPDATE quotes SET line_items=line_items||'[{"quote_line_id":"12320000-0000-4000-8000-000000000212","line_kind":"charge","description":"Synthetic new extra","quantity":1,"unit_price":100,"total":100}]'::jsonb WHERE id='12320000-0000-4000-8000-000000000012';
DO $$ BEGIN IF pg_temp.single_available(12)->>'legacy_review_required' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Added charge did not restore review'; END IF; END $$;
DO $$ BEGIN IF pg_temp.single_available(15)->>'legacy_review_required' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Empty positive history ignored'; END IF; END $$;
SELECT pg_temp.single_expect($s$SELECT pg_temp.single_review(15,34,0,'rental',105)$s$);

-- Same-invoice native+ledger is aggregated before reactivation capacity checks.
SELECT pg_temp.single_review(14,33,1,'charge',106);
DO $$ BEGIN IF pg_temp.single_available(14)#>>'{lines,0,consumed_quantity}' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Mixed own invoice count wrong'; END IF; END $$;
UPDATE invoices SET status='cancelled' WHERE id='12320000-0000-4000-8000-000000000033';
SELECT pg_temp.single_native(14,42,2);
SELECT pg_temp.single_expect($s$UPDATE invoices SET status='draft' WHERE id='12320000-0000-4000-8000-000000000033'$s$);

-- Actor and tenant checks are explicit RPC logic; direct ACL/RLS is untested here.
SET LOCAL request.jwt.claims='{"sub":"12320000-0000-4000-8000-000000000007","role":"authenticated"}';
SELECT pg_temp.single_expect($s$SELECT pg_temp.single_review(12,32,0,'rental',107)$s$,'42501');
SET LOCAL request.jwt.claims='{"sub":"12320000-0000-4000-8000-000000000006","role":"authenticated"}';
SELECT pg_temp.single_expect($s$SELECT public.get_quote_charge_legacy_review('12320000-0000-4000-8000-000000000010')$s$,'42501');
SET LOCAL request.jwt.claims='{"sub":"12320000-0000-4000-8000-000000000005","role":"authenticated"}';
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
SELECT 'QUOTE_CHARGE_SEQUENTIAL_OK' AS sequential_result;
