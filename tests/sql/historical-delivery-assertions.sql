DO $$ BEGIN
 IF (SELECT count(*) FROM delivery_historical_reconciliations) <> 8 THEN RAISE EXCEPTION 'Expected eight reconciliations'; END IF;
 IF (SELECT count(*) FROM audit_logs WHERE table_name='delivery_historical_reconciliations') <> 8 THEN RAISE EXCEPTION 'Expected eight audit entries, including after idempotent replay'; END IF;
 IF EXISTS (SELECT 1 FROM delivery_historical_reconciliations WHERE classification='equipment_sale' AND reference_date<>'2025-10-20') THEN RAISE EXCEPTION 'Incorrect sale dates'; END IF;
 IF EXISTS (SELECT 1 FROM delivery_historical_reconciliations h JOIN deliveries d ON d.id=h.delivery_id JOIN bookings b ON b.id=d.booking_id WHERE h.reference_date<>b.start_date) THEN RAISE EXCEPTION 'Incorrect rental reference date'; END IF;
 IF EXISTS (SELECT 1 FROM deliveries WHERE status<>'scheduled' OR completed_at IS NOT NULL OR signature_base64 IS NOT NULL) THEN RAISE EXCEPTION 'Original logistics evidence changed'; END IF;
 BEGIN UPDATE delivery_historical_reconciliations SET revoked_at=now(),revocation_reason=NULL; RAISE EXCEPTION 'Null revocation reason allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN INSERT INTO delivery_historical_reconciliations(delivery_id,organization_id,classification,reference_date,date_basis,evidence,reason,authorization_source) SELECT delivery_id,'00000000-0000-0000-0000-000000000002',classification,reference_date,date_basis,evidence,reason,authorization_source FROM delivery_historical_reconciliations LIMIT 1; RAISE EXCEPTION 'Cross-organization owner insert allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN DELETE FROM delivery_historical_reconciliations; RAISE EXCEPTION 'Delete unexpectedly allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE delivery_historical_reconciliations SET reference_date='2000-01-01'; RAISE EXCEPTION 'Edit unexpectedly allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET test.org='2ec4801d-ffb1-49b6-aada-9dcdbdda6d74';
SET test.uid='00000000-0000-0000-0000-000000000001'; SET test.internal='yes'; SET test.delivery_access='yes';
SET ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM delivery_historical_reconciliations)<>8 THEN RAISE EXCEPTION 'Own organization read failed'; END IF;
 BEGIN DELETE FROM delivery_historical_reconciliations; RAISE EXCEPTION 'Client write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE delivery_historical_reconciliations SET revoked_at=now(),revocation_reason='Unauthorized'; RAISE EXCEPTION 'Client update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO delivery_historical_reconciliations SELECT * FROM delivery_historical_reconciliations; RAISE EXCEPTION 'Client insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET test.org='00000000-0000-0000-0000-000000000002';
DO $$ BEGIN IF EXISTS(SELECT FROM delivery_historical_reconciliations) THEN RAISE EXCEPTION 'Cross-tenant read'; END IF; END $$;
SET test.org='2ec4801d-ffb1-49b6-aada-9dcdbdda6d74'; SET test.delivery_access='no';
DO $$ BEGIN IF EXISTS(SELECT FROM delivery_historical_reconciliations) THEN RAISE EXCEPTION 'Access exceeds delivery visibility'; END IF; END $$;
SET test.delivery_access='yes'; SET test.internal='no';
DO $$ BEGIN IF EXISTS(SELECT FROM delivery_historical_reconciliations) THEN RAISE EXCEPTION 'Portal read allowed'; END IF; END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
 BEGIN INSERT INTO delivery_historical_reconciliations SELECT * FROM delivery_historical_reconciliations; RAISE EXCEPTION 'Service write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE delivery_historical_reconciliations SET revoked_at=now(); RAISE EXCEPTION 'Service update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM delivery_historical_reconciliations; RAISE EXCEPTION 'Service delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN SELECT count(*) FROM delivery_historical_reconciliations; RAISE EXCEPTION 'Service role access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN BEGIN SELECT count(*) FROM delivery_historical_reconciliations; RAISE EXCEPTION 'Anonymous read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
UPDATE delivery_historical_reconciliations SET revoked_at=now(),revocation_reason='Synthetic test revocation' WHERE delivery_id='787e8d1b-8e51-4850-9da0-4641cfa5d036';
DO $$ BEGIN
 IF (SELECT count(*) FROM delivery_historical_reconciliations WHERE revoked_at IS NULL)<>7 THEN RAISE EXCEPTION 'Revocation failed'; END IF;
 IF (SELECT count(*) FROM audit_logs WHERE action='UPDATE')<>1 THEN RAISE EXCEPTION 'Revocation not audited'; END IF;
 BEGIN UPDATE delivery_historical_reconciliations SET revoked_at=NULL,revocation_reason=NULL WHERE revoked_at IS NOT NULL; RAISE EXCEPTION 'Reactivation allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT 'Historical reconciliation: eight records, dates, idempotence, invariants, RLS, ACL, revocation and audit passed' AS result;
