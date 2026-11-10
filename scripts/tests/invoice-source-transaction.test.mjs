// Opt-in, memory-only PostgreSQL (PGlite). No URL, socket, remote DB, or PAC.
// Exercises real migration functions with a deliberately minimal fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.env.RUN_LOCAL_INVOICE_SOURCE_TESTS !== '1') {
  console.log('SKIP: set RUN_LOCAL_INVOICE_SOURCE_TESTS=1 and PGLITE_MODULE for memory-only tests');
  process.exit(0);
}
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite(); // Never accepts a database path or URL.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const uid = (n) => `12700000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = uid(1), OTHER = uid(2), CUSTOMER = uid(3), BOOKING = uid(10), QUOTE = uid(20), EXT = uid(30), DAMAGE = uid(40);
const legacy = 'supabase/migrations/';
const fn = (file, name, delimiter = '$function$') => {
  const source = read(file);
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const begin = source.indexOf(delimiter, start);
  const end = source.indexOf(`${delimiter};`, begin + delimiter.length);
  assert.ok(begin > start && end > begin, `Missing function delimiters for ${name}`);
  return source.slice(start, end + delimiter.length + 1);
};
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const exec = (sql) => db.exec(sql);
const first = async (sql, params) => (await query(sql, params))[0];
let passed = 0;
const pass = (message) => { passed++; console.log(`PASS ${message}`); };
const payload = (changes = {}) => ({
  booking_id: BOOKING, customer_id: CUSTOMER, customer_name: 'QA synthetic',
  quote_id: QUOTE, line_items: [], subtotal: 100, tax_rate: 16, tax_amount: 16,
  total: 116, moneda: 'MXN', tipo_cambio: 1,
  billing_period_start: '2026-11-11', billing_period_end: '2026-11-20',
  ...changes,
});
async function reset({ status = 'sent', version = 1, expiry = '2026-12-31' } = {}) {
  await exec(`RESET ROLE; SET qa.org='${ORG}'; SET qa.deny_update=''; SET qa.drop_update='';
    TRUNCATE invoice_bookings,booking_extensions,damage_records,invoices,bookings,quotes CASCADE;
    INSERT INTO quotes(id,customer_id,status,version,valid_until)
      VALUES('${QUOTE}','${CUSTOMER}','sent',${version},'${expiry}');
    INSERT INTO bookings(id,customer_id,booking_number,quote_id,start_date,end_date)
      VALUES('${BOOKING}','${CUSTOMER}','QA-B10','${QUOTE}','2026-11-01','2026-11-30'),
      ('${uid(11)}','${CUSTOMER}','QA-B11','${QUOTE}','2026-11-01','2026-11-30');
    INSERT INTO booking_extensions(id,booking_id,original_end_date,new_end_date)
      VALUES('${EXT}','${BOOKING}','2026-11-10','2026-11-20');
    INSERT INTO damage_records(id,customer_id,status,repaired_at)
      VALUES('${DAMAGE}','${CUSTOMER}','repaired','2026-11-01');`);
  if (status !== 'sent') {
    // Fixture-only setup of historical states, then restore real guards.
    await exec(`ALTER TABLE quotes DISABLE TRIGGER ALL;
      UPDATE quotes SET status='${status}',accepted_at=CASE WHEN '${status}' IN ('accepted','converted') THEN '2026-11-01'::timestamptz ELSE NULL END;
      ALTER TABLE quotes ENABLE TRIGGER ALL;`);
  }
}
async function save({ invoice = payload(), bookings = [BOOKING], invoiceId = null,
  invoiceVersion = null, damageId = null, extensionId = EXT, quoteId = QUOTE,
  quoteVersion = 1, role = 'authenticated' } = {}) {
  await exec(`SET ROLE ${role}`);
  try {
    return await query(`SELECT * FROM public.save_invoice_with_sources(
      $1::jsonb,$2::uuid[],$3::uuid,$4::integer,$5::uuid,$6::uuid,$7::uuid,$8::integer)`,
    [invoice, bookings, invoiceId, invoiceVersion, damageId, extensionId, quoteId, quoteVersion]);
  } finally { await exec('RESET ROLE'); }
}
async function snapshot() {
  const result = {};
  for (const table of ['invoices','invoice_bookings','booking_extensions','quotes','damage_records']) {
    result[table] = await query(`SELECT to_jsonb(t) AS data FROM ${table} t ORDER BY to_jsonb(t)::text`);
  }
  return result;
}
async function rejectsUnchanged(options, code, pattern) {
  const before = await snapshot();
  await assert.rejects(save(options), (error) => {
    assert.equal(error.code, code, error.message);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
  assert.deepEqual(await snapshot(), before, 'Failure must roll back invoice, pivot, extension, damage and quote');
}

try {
  await exec(read('tests/sql/invoice-source-transaction-fixture.sql'));
  await exec(fn(`${legacy}20260903215543_3f0d73fb-b8e1-4620-9e06-42f4ffe7af0d.sql`, 'lock_bookings_for_billing', '$$'));
  await exec(fn('drizzle/migrations/0121_completed_recurring_invoice_overlap.sql', 'sync_invoice_bookings'));
  await exec(fn(`${legacy}20260910054038_54287884-be74-4b89-a318-a20cb8437223.sql`, 'save_invoice_with_bookings', '$fn$'));
  await exec(fn(`${legacy}20260910023735_7445b1eb-6d15-4e66-b923-57e018a34cc5.sql`, 'save_invoice_with_bookings'));
  await exec(fn(`${legacy}20260910024557_390c2a87-231f-4ac8-9668-75f52c7888c5.sql`, 'validate_transition'));
  await exec(fn(`${legacy}20260831214117_7ba0b339-3b67-4d1e-81dd-66fde19c58b7.sql`, 'guard_quote_acceptance'));
  await exec(fn(`${legacy}20260720163313_c1932be1-97eb-46bc-a2fe-e458be144cbc.sql`, 'bump_version_optimistic', '$$'));
  await exec(fn(`${legacy}20260813211758_8dc66080-9853-4c1d-8d92-eac485615885.sql`, 'enforce_booking_extension_billing_lock', '$$'));
  await exec(read(`${legacy}20260910060708_1fe41e4a-1428-433b-becc-e7655be087bd.sql`));
  await exec(`CREATE TRIGGER trg_quote_transition BEFORE UPDATE OF status ON quotes FOR EACH ROW EXECUTE FUNCTION validate_transition();
    CREATE TRIGGER quotes_guard_acceptance BEFORE UPDATE OF status ON quotes FOR EACH ROW EXECUTE FUNCTION guard_quote_acceptance();
    CREATE TRIGGER trg_quotes_version BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION bump_version_optimistic();
    CREATE TRIGGER trg_invoices_version BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION bump_version_optimistic();
    CREATE TRIGGER trg_extension_invoice_link BEFORE INSERT OR UPDATE ON booking_extensions FOR EACH ROW EXECUTE FUNCTION enforce_extension_invoice_link();
    CREATE TRIGGER trg_booking_extension_billing_lock BEFORE INSERT OR UPDATE ON booking_extensions FOR EACH ROW EXECUTE FUNCTION enforce_booking_extension_billing_lock();`);
  await exec(read('drizzle/migrations/0127_invoice_source_transaction.sql'));

  const signature = 'public.save_invoice_with_sources(jsonb,uuid[],uuid,integer,uuid,uuid,uuid,integer)';
  const meta = await first(`SELECT prosecdef,proconfig,pronargdefaults FROM pg_proc WHERE oid=$1::regprocedure`, [signature]);
  assert.equal(meta.prosecdef, false);
  assert.equal(meta.pronargdefaults, 7);
  assert.deepEqual(meta.proconfig, ['search_path=public, pg_temp']);
  for (const [role, allowed] of [['anon',false],['authenticated',true],['service_role',true]]) {
    assert.equal((await first('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS ok',[role,signature])).ok,allowed);
  }
  pass('RPC metadata: INVOKER, fixed search_path, defaults and bounded EXECUTE grants');

  await reset();
  const [created] = await save();
  assert.equal(created.status,'draft'); assert.equal(created.cfdi_uuid,null);
  assert.equal((await first('SELECT count(*)::int AS n FROM invoice_bookings')).n,1);
  assert.deepEqual(await first('SELECT pending_invoice_id,invoice_id,billed_at FROM booking_extensions'),
    {pending_invoice_id:created.id,invoice_id:null,billed_at:null});
  const accepted = await first('SELECT status,version,accepted_at IS NOT NULL AS dated FROM quotes');
  assert.deepEqual(accepted,{status:'accepted',version:2,dated:true});
  pass('One call commits draft, pivot, pending extension and sent→accepted quote');
  await exec(`UPDATE invoices SET status='sent' WHERE id='${created.id}'`);
  assert.deepEqual(await first('SELECT pending_invoice_id,invoice_id,billed_at IS NOT NULL AS billed FROM booking_extensions'),
    {pending_invoice_id:null,invoice_id:created.id,billed:true});
  pass('Existing issuance trigger, not wrapper, finalizes extension and billed_at');

  for (const state of ['accepted','converted']) {
    await reset({status:state});
    const before = await first('SELECT * FROM quotes');
    await save();
    assert.deepEqual(await first('SELECT * FROM quotes'),before);
    pass(`${state} quote is a true no-op: original version and acceptance date preserved`);
  }
  for (const state of ['draft','rejected','expired','cancelled']) {
    await reset({status:state}); await rejectsUnchanged({},'23514',/enviada, aceptada o convertida/);
    pass(`${state} quote rolls back invoice, pivot and pending extension`);
  }
  await reset({expiry:'2026-11-06'}); await rejectsUnchanged({},'23514',/vencida/);
  pass('Real quote expiry trigger rolls back all earlier writes');
  for (const status of ['sent','accepted','converted']) {
    await reset({status,version:2}); await rejectsUnchanged({},'55000',/stale_write/);
    pass(`Stale ${status} quote version rejects without any persisted side effect`);
  }
  await reset();
  for (const quoteVersion of [null,0,-1]) await rejectsUnchanged({quoteVersion},'23514',/versión válida/);
  await rejectsUnchanged({quoteId:null,quoteVersion:1},'23514',/requiere/);
  await rejectsUnchanged({quoteId:uid(21)},'23514',/cotización de la factura/);
  pass('Quote version and origin identity are mandatory and fail before saving');

  await reset(); await exec(`UPDATE quotes SET customer_id='${uid(4)}'`);
  await rejectsUnchanged({quoteVersion:2},'23514',/cliente de origen/);
  pass('Quote customer mismatch rolls back the entire transaction');

  for (const table of ['booking_extensions','quotes']) {
    await reset(); await exec(`SET qa.deny_update='${table}'`);
    await rejectsUnchanged({},'42501');
    pass(`Invoker RLS denial on ${table} rolls back invoice and earlier sources`);
    await reset(); await exec(`SET qa.drop_update='${table}'`);
    await rejectsUnchanged({},'42501');
    pass(`Zero-row ${table} update cannot produce a false success`);
  }

  await reset(); await rejectsUnchanged({extensionId:uid(31)},'42501',/Extensión/);
  await reset(); await exec(`UPDATE booking_extensions SET organization_id='${OTHER}'`);
  for (const role of ['authenticated','service_role']) await rejectsUnchanged({role},'42501',/Extensión/);
  pass('Missing/cross-tenant extension denied, including service-role visibility');
  await reset(); await exec(`UPDATE quotes SET organization_id='${OTHER}'`);
  for (const role of ['authenticated','service_role']) await rejectsUnchanged({role,quoteVersion:2},'42501',/Cotización/);
  pass('Cross-tenant quote denied, including service-role visibility');
  await reset(); await exec(`UPDATE bookings SET organization_id='${OTHER}' WHERE id='${BOOKING}'`);
  await rejectsUnchanged({role:'service_role'},'23514',/reserva de esta extensión/);
  pass('Explicit extension booking tenant guard protects privileged callers');

  await reset(); await rejectsUnchanged({invoice:payload({booking_id:uid(11)}),bookings:[uid(11)]},'23514',/reserva de esta extensión/);
  await reset(); await rejectsUnchanged({invoice:payload({customer_id:null}),quoteId:null,quoteVersion:null},'23514',/cliente de la extensión/);
  pass('Extension requires its actual booking and customer');
  for (const changes of [{billing_period_start:'2026-11-12'}, {billing_period_end:'2026-11-19'}]) {
    await reset(); await rejectsUnchanged({invoice:payload(changes)},'23514',/todos los días/);
  }
  await reset(); await exec("UPDATE booking_extensions SET new_end_date=original_end_date");
  await rejectsUnchanged({},'23514',/todos los días/);
  pass('Inclusive extension coverage must include original_end_date+1 through new_end_date');

  // Use recurring semantics to avoid the earlier overlap guard masking the
  // pending-owner check, then verify a second creation leaves no orphan draft.
  await reset(); await exec('UPDATE bookings SET recurring_billing=true');
  const [owner] = await save({quoteId:null,quoteVersion:null});
  await rejectsUnchanged({invoice:payload({billing_period_start:'2026-11-10',billing_period_end:'2026-11-21'}),quoteId:null,quoteVersion:null},'23505',/reservada/);
  await exec(`UPDATE invoices SET status='cancelled',cfdi_status='cancelled' WHERE id='${owner.id}'`);
  await rejectsUnchanged({quoteId:null,quoteVersion:null},'23505',/reservada/);
  pass('A different pending invoice is never replaced, including cancelled pending history');

  await reset(); const [issued] = await save({quoteId:null,quoteVersion:null});
  await exec(`UPDATE invoices SET status='sent' WHERE id='${issued.id}'; UPDATE bookings SET recurring_billing=true`);
  await rejectsUnchanged({invoice:payload({billing_period_start:'2026-11-10',billing_period_end:'2026-11-21'}),quoteId:null,quoteVersion:null},'23505',/facturada/);
  pass('An issued extension cannot be linked again');

  await reset(); await rejectsUnchanged({invoice:payload({billing_period_end:'2026-12-01'})},'23514',/fuera del rango/);
  await save({extensionId:null,quoteId:null,quoteVersion:null});
  await rejectsUnchanged({extensionId:null,quoteId:null,quoteVersion:null},'23505',/cobertura/);
  pass('Existing range and overlap guards remain authoritative');

  await reset(); const [ordinary] = await save({extensionId:null,quoteId:null,quoteVersion:null});
  await rejectsUnchanged({invoiceId:ordinary.id,invoiceVersion:1},'23514',/sólo pueden ligarse/);
  const [edited] = await save({invoice:payload({notes:'safe edit'}),invoiceId:ordinary.id,invoiceVersion:1,
    extensionId:null,quoteId:null,quoteVersion:null});
  assert.equal(edited.version,2); assert.equal(edited.notes,'safe edit');
  await rejectsUnchanged({invoiceId:ordinary.id,invoiceVersion:1,extensionId:null,quoteId:null,quoteVersion:null},'55000',/stale_write/);
  pass('Source effects are creation-only; ordinary optimistic edits still delegate correctly');

  await reset(); const [damaged] = await save({damageId:DAMAGE});
  assert.deepEqual(await first('SELECT status,invoice_id FROM damage_records'),{status:'invoiced',invoice_id:damaged.id});
  pass('Existing five-argument damage RPC remains part of the same transaction');
  await reset({expiry:'2026-11-06'}); await rejectsUnchanged({damageId:DAMAGE},'23514',/vencida/);
  await reset(); await exec("UPDATE damage_records SET status='reported',repaired_at=NULL");
  await rejectsUnchanged({damageId:DAMAGE},'23514',/reparado/);
  await reset(); await exec(`UPDATE damage_records SET organization_id='${OTHER}'`);
  await rejectsUnchanged({damageId:DAMAGE,role:'service_role'},'23514',/empresa/);
  pass('Damage rollback, repair guard and explicit tenant check remain enforced');

  await reset(); const [fiscal] = await save({invoice:payload({status:'sent',cfdi_uuid:uid(70),cfdi_status:'stamped'})});
  assert.equal(fiscal.status,'draft'); assert.equal(fiscal.cfdi_uuid,null); assert.equal(fiscal.cfdi_status,null);
  await reset(); await rejectsUnchanged({role:'anon'},'42501',/permission denied/);
  pass('Payload cannot issue/timbrar; anon cannot execute the new RPC');
  await exec(read('supabase/tests/rls/invoice_source_transaction_contract.sql'));
  pass('Full-replay SQL metadata/negative contract suite also passes on fixture');
  console.log(`${passed} PASS groups; single-session in-memory tests, not concurrent-session or full-schema certification.`);
} finally { await db.close(); }
