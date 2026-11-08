// In-memory trigger model only. Full-schema/two-session tests belong to CI.
// Pass the installed PGlite entry path; never accepts a database URL.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const query=(s)=>db.query(s);
let passed=0;
const org='10000000-0000-4000-8000-000000000001';
const uid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const quote=(n,kind='sale')=>query(`INSERT INTO quotes VALUES ('${uid(n)}','${org}','${kind}')`);
const insert=(n,q)=>`INSERT INTO invoices(id,organization_id,quote_id) VALUES ('${uid(n)}','${org}','${uid(q)}')`;
const reject=async(s,code='23505')=>{await assert.rejects(query(s),e=>e.code===code);};
const pass=s=>{passed++;console.log('PASS model '+s);};
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE quotes(id uuid PRIMARY KEY, organization_id uuid NOT NULL, quote_type text);
 CREATE TABLE invoices(id uuid PRIMARY KEY, organization_id uuid NOT NULL, quote_id uuid REFERENCES quotes, status text DEFAULT 'draft', cfdi_status text, cfdi_uuid text, facturapi_invoice_id text, cancellation_status text);
 CREATE FUNCTION quote_charge_invoice_active(p_invoice invoices) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN p_invoice.cfdi_status='stamping' THEN true WHEN p_invoice.cfdi_status='stamped' OR p_invoice.cfdi_uuid IS NOT NULL THEN p_invoice.cancellation_status IS DISTINCT FROM 'accepted' ELSE p_invoice.status IS DISTINCT FROM 'cancelled' AND p_invoice.cfdi_status IS DISTINCT FROM 'cancelled' END $$;`);
 await quote(1);await query(insert(10,1));await query(insert(11,1));
 assert.equal((await query('SELECT count(*)::int AS n FROM invoices')).rows[0].n,2);pass('baseline missing guard permits two drafts');
 await quote(8);await query(insert(80,8));await query(insert(81,8));await query(`UPDATE invoices SET cfdi_status='stamping' WHERE id='${uid(80)}'`);
 await quote(9);await query(insert(90,9));await query(insert(91,9));await query(`UPDATE invoices SET cfdi_status='error' WHERE quote_id='${uid(9)}'`);
 await db.exec(readFileSync(new URL('../../drizzle/migrations/0130_sale_quote_invoice_uniqueness.sql',import.meta.url),'utf8'));
 await reject(insert(12,1));await query(`UPDATE invoices SET status='draft' WHERE id='${uid(10)}'`);
 await reject(`UPDATE invoices SET status='sent' WHERE id='${uid(10)}'`);
 await reject(`UPDATE invoices SET cfdi_status='stamping' WHERE id='${uid(10)}'`);pass('historical notes allowed, duplicate creation and new issuance blocked');
 await query(`UPDATE invoices SET status='sent',cfdi_status='stamped',cfdi_uuid='pre-existing-flight' WHERE id='${uid(80)}'`);pass('historical in-flight fiscal response persists despite duplicate peer');
 await query(`UPDATE invoices SET cfdi_status='stamping',facturapi_invoice_id='recovered-pending' WHERE id='${uid(90)}'`);
 await query(`UPDATE invoices SET cfdi_status='stamping',facturapi_invoice_id='recovered-hit',cfdi_uuid='recovered-uuid' WHERE id='${uid(91)}'`);pass('recovery error-to-stamping with remote PAC identity is preserved');
 await quote(2,'rental');await query(insert(20,2));await query(insert(21,2));pass('rental remains multiple');
 await quote(3);await query(insert(30,3));await query(`UPDATE invoices SET status='cancelled' WHERE id='${uid(30)}'`);await query(insert(31,3));await reject(`UPDATE invoices SET status='draft' WHERE id='${uid(30)}'`);pass('cancellation frees claim, reactivation checks conflict');
 await quote(4);await query(insert(40,4));await query(`UPDATE invoices SET status='cancelled',cfdi_status='stamped',cfdi_uuid='synthetic' WHERE id='${uid(40)}'`);await reject(insert(41,4));await query(`UPDATE invoices SET cancellation_status='accepted' WHERE id='${uid(40)}'`);await query(insert(41,4));pass('stamped remains active until fiscal cancellation accepted');
 await quote(5);await reject(`INSERT INTO invoices(id,organization_id,quote_id) VALUES ('${uid(50)}','${org}','${uid(5)}'),('${uid(51)}','${org}','${uid(5)}')`);assert.equal((await query(`SELECT count(*)::int AS n FROM invoices WHERE quote_id='${uid(5)}'`)).rows[0].n,0);pass('multirow duplicate rolls back both');
 await reject(`UPDATE invoices SET quote_id='${uid(1)}' WHERE id='${uid(20)}'`);pass('quote reassignment checked');
 await quote(6);await query('BEGIN ISOLATION LEVEL REPEATABLE READ');await reject(insert(60,6),'25001');await query('ROLLBACK');pass('fixed snapshot rejected');
 // A fiscal response already in flight must remain persistable. Model old
 // duplicate rows predating this migration with a staging disabled trigger is
 // deliberately NOT used; preserve a known stamping row before introducing peer.
 await quote(7);await query(insert(70,7));await query(`UPDATE invoices SET cfdi_status='stamping' WHERE id='${uid(70)}'`);await query(`UPDATE invoices SET cfdi_status='stamped',cfdi_uuid='synthetic-inflight' WHERE id='${uid(70)}'`);pass('claim then fiscal completion remains writable');
 await db.exec(`ALTER TABLE invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE invoices FORCE ROW LEVEL SECURITY; GRANT SELECT,INSERT ON invoices TO authenticated; CREATE POLICY model_hidden ON invoices FOR SELECT TO authenticated USING(false); CREATE POLICY model_insert ON invoices FOR INSERT TO authenticated WITH CHECK(true); SET ROLE authenticated;`);
 assert.equal((await query('SELECT count(*)::int AS n FROM invoices')).rows[0].n,0);await reject(insert(32,3));await query('RESET ROLE');pass('definer detects duplicate hidden from invoking role');
 console.log(`${passed} model groups passed; no full-schema/concurrency certification`);
} finally {await db.close();}
