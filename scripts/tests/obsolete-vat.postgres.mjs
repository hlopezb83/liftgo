// Disposable loopback PostgreSQL fixture only. Never accepts a database URL.
// PG_BIN must point to trusted, already installed PostgreSQL executables.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import postgres from 'postgres';
const bin = process.env.PG_BIN;
assert(bin && path.isAbsolute(bin), 'Set PG_BIN to installed trusted PostgreSQL binaries');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liftgo-legacy-vat-'));
const pg = (name, args) => execFileSync(path.join(bin, name), args, { encoding: 'utf8', timeout: 30000 });
let db, started = false;
try {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  pg('initdb', ['-D', `${dir}/data`, '-U', 'postgres', '--auth=trust']);
  pg('pg_ctl', ['-D', `${dir}/data`, '-l', `${dir}/server.log`, '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, 'start']);
  started = true;
  db = postgres({host:'127.0.0.1', port, username:'postgres', database:'postgres', max:1, prepare:false, onnotice:()=>{}});
  await db.unsafe(`CREATE TABLE invoices(id int PRIMARY KEY, tax_rate numeric, line_items jsonb, notes text, total numeric);
    CREATE TABLE quotes(LIKE invoices INCLUDING ALL);
    CREATE TABLE credit_notes(LIKE invoices INCLUDING ALL);
    CREATE ROLE fixture_reader;
    GRANT SELECT ON invoices, quotes, credit_notes TO fixture_reader;
    INSERT INTO invoices VALUES (1,11,'[{"tax_rate":11}]','historical',111);
    INSERT INTO quotes SELECT * FROM invoices;
    INSERT INTO credit_notes SELECT * FROM invoices;`);
  const security = async () => JSON.stringify(await db.unsafe(`SELECT
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY oid) FROM pg_roles r) AS roles,
    (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid, member) FROM pg_auth_members m) AS memberships,
    (SELECT jsonb_agg(jsonb_build_object('name',relname,'acl',relacl::text,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r') AS tables,
    (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p) AS policies`));
  const beforeSecurity = await security();
  const beforeRows = JSON.stringify(await db`SELECT * FROM invoices UNION ALL SELECT * FROM quotes UNION ALL SELECT * FROM credit_notes`);
  await db.unsafe(fs.readFileSync(new URL('../../drizzle/migrations/0120_reject_obsolete_vat_new_sales.sql', import.meta.url), 'utf8'));
  assert.equal(await security(), beforeSecurity, 'roles, memberships, existing ACL and RLS unchanged');
  assert.equal(JSON.stringify(await db`SELECT * FROM invoices UNION ALL SELECT * FROM quotes UNION ALL SELECT * FROM credit_notes`), beforeRows, 'migration does not rewrite history');
  for (const table of ['invoices','quotes']) {
    for (const rate of ['11','11.00']) {
      await assert.rejects(db.unsafe(`INSERT INTO ${table} VALUES (2,${rate},'[]','new',111)`), {code:'23514'});
    }
    for (const rate of [11,'11','11.00','1.1e1']) {
      await assert.rejects(db.unsafe(`INSERT INTO ${table} VALUES (2,16,$1::text::jsonb,'new',111)`, [JSON.stringify([{tax_rate:rate}])]), {code:'23514'});
    }
    await db.unsafe(`INSERT INTO ${table} VALUES (2,16,'[]','new',116)`);
    await assert.rejects(db.unsafe(`UPDATE ${table} SET tax_rate=11 WHERE id=2`), {code:'23514'});
    await assert.rejects(db.unsafe(`UPDATE ${table} SET line_items='[{"tax_rate":11}]' WHERE id=2`), {code:'23514'});
    await db.unsafe(`UPDATE ${table} SET notes='reviewed', tax_rate=tax_rate, line_items=line_items WHERE id=1`);
    assert.deepEqual(Array.from(await db.unsafe(`SELECT tax_rate::float, line_items, total::float FROM ${table} WHERE id=1`)), [{tax_rate:11,line_items:[{tax_rate:11}],total:111}]);
    await db.unsafe(`UPDATE ${table} SET tax_rate=16,line_items='[{"tax_rate":16}]',total=116 WHERE id=1`);
    assert.equal((await db.unsafe(`SELECT tax_rate::float FROM ${table} WHERE id=1`))[0].tax_rate,16);
    for (const [id,rate] of [[3,0],[4,16],[5,8]]) await db.unsafe(`INSERT INTO ${table} VALUES ($1,$2,'[]','nonlegacy',100)`,[id,rate]);
  }
  // Historical related adjustments remain under their own existing rules.
  await db`INSERT INTO credit_notes VALUES (2,11,'[{"tax_rate":11}]','related historical adjustment',111)`;
  assert.equal(await security(),beforeSecurity);
  console.log('PASS: direct INSERT/UPDATE guards, header/line/string 11, explicit correction, historical rows and security preserved; NC unchanged');
} finally {
  if (db) await db.end();
  if (started) pg('pg_ctl',['-D',`${dir}/data`,'-m','immediate','stop']);
  fs.rmSync(dir,{recursive:true,force:true});
}
