"""Isolated PG trigger model, NOT the full Supabase schema or RPC integration.
Only a fresh temp cluster, Unix socket, trust local test user; never a DB URL.
Usage: python3 scripts/tests/sale-quote-guard-isolated.py /path/to/postgresql/bin
"""
import pathlib, subprocess, sys, tempfile, time, concurrent.futures
BIN=pathlib.Path(sys.argv[1]).resolve()
ROOT=pathlib.Path(__file__).resolve().parents[2]
def run(*args, **kw): return subprocess.run([str(x) for x in args],check=True,text=True,capture_output=True,**kw)
with tempfile.TemporaryDirectory(prefix='sale-guard-isolated-') as tmp:
    tmp=pathlib.Path(tmp); data=tmp/'data'
    run(BIN/'initdb','-D',data,'-A','trust','--no-locale')
    try: run(BIN/'pg_ctl','-D',data,'-l',tmp/'server.log','-o',f"-k {tmp} -h '' -p 55439",'-w','start')
    except subprocess.CalledProcessError:
        print((tmp/'server.log').read_text()); raise
    def sql(query,ok=True):
        r=subprocess.run([str(BIN/'psql'),'-h',str(tmp),'-p','55439','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-c',query],text=True,capture_output=True)
        if ok and r.returncode: raise AssertionError(r.stderr)
        return r
    def scalar(q): return sql(q).stdout.strip()
    try:
        sql('''CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE quotes(id uuid PRIMARY KEY, organization_id uuid NOT NULL, quote_type text);
CREATE TABLE invoices(id uuid PRIMARY KEY, organization_id uuid NOT NULL, quote_id uuid REFERENCES quotes, status text DEFAULT 'draft', cfdi_status text, cfdi_uuid text, facturapi_invoice_id text, cancellation_status text);
CREATE FUNCTION quote_charge_invoice_active(p_invoice invoices) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN p_invoice.cfdi_status='stamping' THEN true
 WHEN p_invoice.cfdi_status='stamped' OR p_invoice.cfdi_uuid IS NOT NULL THEN p_invoice.cancellation_status IS DISTINCT FROM 'accepted'
 ELSE p_invoice.status IS DISTINCT FROM 'cancelled' AND p_invoice.cfdi_status IS DISTINCT FROM 'cancelled' END $$;''')
        org='10000000-0000-4000-8000-000000000001'
        def uid(n): return f'20000000-0000-4000-8000-{n:012}'
        def quote(n,kind='sale'): sql(f"INSERT INTO quotes VALUES ('{uid(n)}','{org}','{kind}')")
        def insert(n,q): return f"INSERT INTO invoices(id,organization_id,quote_id) VALUES ('{uid(n)}','{org}','{uid(q)}');"
        quote(1); sql(insert(10,1)+insert(11,1)); assert scalar('SELECT count(*) FROM invoices')=='2'
        print('PASS baseline model permits two drafts; no claim of full RPC reproduction')
        sql((ROOT/'drizzle/migrations/0130_sale_quote_invoice_uniqueness.sql').read_text())
        sql(f"UPDATE invoices SET status='draft' WHERE id='{uid(10)}'")
        assert sql(f"UPDATE invoices SET status='sent' WHERE id='{uid(10)}'",False).returncode
        assert sql(f"UPDATE invoices SET cfdi_status='stamping' WHERE id='{uid(10)}'",False).returncode
        r=sql(insert(12,1),False); assert r.returncode and 'factura activa' in r.stderr
        assert scalar('SELECT count(*) FROM invoices')=='2'
        print('PASS historical duplicates preserved, edits work, new duplicate rejected')
        quote(2,'rental'); sql(insert(20,2)+insert(21,2)); print('PASS rental invoices unaffected')
        quote(3); sql(insert(30,3)); sql(f"UPDATE invoices SET status='cancelled' WHERE id='{uid(30)}'");sql(insert(31,3))
        r=sql(f"UPDATE invoices SET status='draft' WHERE id='{uid(30)}'",False);assert r.returncode and 'factura activa' in r.stderr
        print('PASS valid cancellation frees claim, conflicting reactivation fails')
        quote(4); sql(insert(40,4));sql(f"UPDATE invoices SET status='cancelled',cfdi_status='stamped',cfdi_uuid='synthetic' WHERE id='{uid(40)}'")
        assert sql(insert(41,4),False).returncode
        sql(f"UPDATE invoices SET cancellation_status='accepted' WHERE id='{uid(40)}'");sql(insert(41,4))
        print('PASS stamped cancellation remains reserved until accepted')
        quote(5)
        with concurrent.futures.ThreadPoolExecutor() as pool:
            first=pool.submit(sql,'BEGIN;'+insert(50,5)+'SELECT pg_sleep(2);COMMIT;')
            time.sleep(.4)
            second=pool.submit(sql,insert(51,5),False)
            blocked=False
            for _ in range(25):
                if int(scalar("SELECT count(*) FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0"))>0: blocked=True;break
                time.sleep(.04)
            assert blocked,'No real lock wait observed'
            first.result(); loser=second.result(); assert loser.returncode and 'factura activa' in loser.stderr
        assert scalar(f"SELECT count(*) FROM invoices WHERE quote_id='{uid(5)}'")=='1'
        print('PASS two sessions wait, exactly one sale draft commits')
        quote(6)
        r=sql('BEGIN ISOLATION LEVEL REPEATABLE READ;'+insert(60,6)+'COMMIT;',False);assert r.returncode and 'READ COMMITTED' in r.stderr
        assert scalar(f"SELECT count(*) FROM invoices WHERE quote_id='{uid(6)}'")=='0'
        print('PASS fixed snapshot rejected without residue')
    finally: run(BIN/'pg_ctl','-D',data,'-m','immediate','-w','stop')
