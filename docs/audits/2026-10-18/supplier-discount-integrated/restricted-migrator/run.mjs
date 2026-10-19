import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory=dirname(fileURLToPath(import.meta.url));
const root=resolve(directory,'../../../../..');
const inputDirectory=resolve(directory,'..');
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw new Error('Use before or after plus an exact candidate path.');
const candidate=resolve(process.argv[3]);
if(!candidate.startsWith(resolve(root,'..')+sep))throw new Error('Candidate must stay in task workspace.');
const local=resolve(root,'.local-pg');
const data=resolve(local,'data-restricted');
const tmp=resolve(local,'tmp-restricted');
mkdirSync(tmp,{recursive:true});
const bin=process.env.K1_PG_BIN;
if(!bin)throw new Error('Set K1_PG_BIN to installed PostgreSQL binaries.');
const env={...process.env,TEMP:tmp,TMP:tmp,PGCONNECT_TIMEOUT:'5'};
let sequence=0,log='';
const database=`liftgo_k1_restricted_${phase}_final`;
const base=['-X','-h','127.0.0.1','-p','55443','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','--set=VERBOSITY=verbose'];
function run(exe,args,allowed=false,input){
 const file=resolve(tmp,`${phase}-${sequence++}.txt`);
 const fd=exe==='pg_ctl'?openSync(file,'w'):undefined;
 const r=spawnSync(resolve(bin,exe+'.exe'),args,{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:45000,input,...(fd===undefined?{}:{stdio:['ignore',fd,fd]})});
 if(fd!==undefined)closeSync(fd);
 const output=fd===undefined?(r.stdout??'')+(r.stderr??''):readFileSync(file,'utf8');
 log+=`${exe} ${JSON.stringify(args.map(v=>v.replaceAll(root,'<worktree>')))}\n${output}\nEXIT=${r.status}\n`;
 if(r.error)throw r.error;if(r.status!==0&&!allowed)throw new Error(exe+' failed: '+output.slice(-900));
 return {...r,output};
}
const sql=(text,allowed=false,user='postgres')=>run('psql',[...base,'-U',user,'-Atq'],allowed,text);
const sha=(file)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const checks=[];
function check(id,passed,details){checks.push({id,passed,...details});}
const user='00000000-0000-4000-8000-000000000001';
const bill='00000000-0000-4000-8000-000000000203';
let started=false;
try{
 if(!existsSync(resolve(data,'PG_VERSION')))run('initdb',['-D',data,'-U','postgres','-A','trust','--locale=C','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',resolve(local,'restricted-server.log'),'-o','-h 127.0.0.1 -p 55443','-w','-t','30','start']);started=true;
 const identity=JSON.parse(run('psql',['-X','-h','127.0.0.1','-p','55443','-U','postgres','-d','postgres','-Atq','-c',"SELECT json_build_object('data_directory',current_setting('data_directory'),'port',inet_server_port(),'address',inet_server_addr(),'version',version())"]).stdout.trim());
 if(resolve(identity.data_directory).toLowerCase()!==data.toLowerCase()||identity.port!==55443||identity.address!=='127.0.0.1')throw new Error('Cluster identity mismatch: writes prohibited.');
 run('createdb',['-h','127.0.0.1','-p','55443','-U','postgres',database]);
 sql(`DO $$ BEGIN CREATE ROLE restricted_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
 run('psql',[...base,'-f',resolve(inputDirectory,'baseline-fixture.sql')]);
 // Only this fresh local DB is changed. DDL parameter privileges are tested
 // separately from the trusted application definer's existing table access.
 sql(`GRANT USAGE,CREATE ON SCHEMA public TO restricted_migrator;
 GRANT USAGE ON SCHEMA auth TO restricted_migrator;
 GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO restricted_migrator;
 REVOKE SET ON PARAMETER "app.cxp_rpc", "app.cxp_recalc", "app.audit_revert" FROM PUBLIC;`);
 const privilege=JSON.parse(sql(`SELECT json_build_object('superuser',rolsuper,'create_role',rolcreaterole,'create_db',rolcreatedb,'parameter_set',jsonb_build_object('app.cxp_rpc',has_parameter_privilege(rolname,'app.cxp_rpc','SET'),'app.cxp_recalc',has_parameter_privilege(rolname,'app.cxp_recalc','SET'),'app.audit_revert',has_parameter_privilege(rolname,'app.audit_revert','SET'))) FROM pg_roles WHERE rolname='restricted_migrator';`).stdout.trim());
 check('restricted-role-has-no-SET-privileges',privilege.superuser===false&&Object.values(privilege.parameter_set).every(v=>v===false),{actual:privilege});
 const migration=run('psql',[...base,'-U','restricted_migrator','--single-transaction','-f',candidate],true);
 check('migration-applies-as-restricted-role',migration.status===0,{exit_code:migration.status,sqlstate:migration.output.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1]??null,error:migration.status===0?null:migration.output.trim()});
 const catalog=JSON.parse(sql(`SELECT json_build_object('exists',count(*)=1,'owner',max(pg_get_userbyid(proowner)),'config',max(proconfig::text),'security_definer',bool_and(prosecdef)) FROM pg_proc WHERE oid=to_regprocedure('public.update_supplier_bill_details(uuid,jsonb)');`).stdout.trim());
 check('new-function-config-only-search-path',catalog.exists&&catalog.owner==='restricted_migrator'&&catalog.security_definer===true&&catalog.config==='{"search_path=pg_catalog, public, pg_temp"}',{actual:catalog});
 if(catalog.exists){
  // The existing fixture's FORCE RLS expects a trusted postgres definer.
  // No BYPASSRLS, role membership, or parameter privilege is granted to the
  // restricted migration role. This is an explicit runtime fixture boundary.
  sql(`ALTER FUNCTION public.update_supplier_bill_details(uuid,jsonb) OWNER TO postgres;
   UPDATE public.supplier_bills SET supplier_id='00000000-0000-4000-8000-000000000301',category='renta' WHERE id='${bill}';`);
  sql(`CREATE FUNCTION public.k1_restricted_observe(p_patch jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
   DECLARE a jsonb;b jsonb;got uuid;code text:='00000';msg text:='accepted';
   BEGIN SELECT to_jsonb(s) INTO a FROM public.supplier_bills s WHERE id='${bill}';
    BEGIN got:=public.update_supplier_bill_details('${bill}',p_patch); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,msg=MESSAGE_TEXT; END;
    SELECT to_jsonb(s) INTO b FROM public.supplier_bills s WHERE id='${bill}';
    RETURN jsonb_build_object('code',code,'message',msg,'caller',current_user,'session',session_user,'result',got,'before',a,'after',b);
   END $$;`);
  const probe=(id,flag,expected)=>{
   const result=JSON.parse(sql(`BEGIN;
    SET LOCAL request.jwt.claims='{"sub":"${user}","role":"authenticated"}';
    ${flag?`SET LOCAL ${flag}='on';`:''}
    SET LOCAL ROLE authenticated;
    SELECT public.k1_restricted_observe((SELECT jsonb_object_agg(key,value) FROM public.supplier_bills b,LATERAL jsonb_each(to_jsonb(b)) WHERE b.id='${bill}' AND key=ANY(ARRAY['supplier_id','category','description','issue_date','due_date','coverage_start','coverage_end','currency','exchange_rate','subtotal','discount','tax_amount','retention_iva','retention_isr','total','cfdi_uuid','payment_method_sat','cfdi_xml_url']))||'{"description":"restricted metadata edit"}'::jsonb);
    ROLLBACK;`).stdout.trim());
   const unchanged=JSON.stringify(result.before)===JSON.stringify(result.after);
   const metadataOnly=JSON.stringify({...result.before,description:null,updated_at:null})===JSON.stringify({...result.after,description:null,updated_at:null});
   check(id,result.code===expected&&result.caller==='authenticated'&&(expected==='00000'?metadataOnly&&result.after.description==='restricted metadata edit'&&result.result===bill:unchanged),{expected_sqlstate:expected,actual:result});
  };
  probe('authenticated-identical-money-metadata-accepted',null,'00000');
  for(const flag of ['app.cxp_rpc','app.cxp_recalc','app.audit_revert'])probe(`reject-inherited-${flag}`,flag,'42501');
  // Reuse the exact 30 existing legacy/typmod cases; no added business matrix.
  run('psql',[...base,'-f',resolve(inputDirectory,'cases.sql')]);
  const legacy=JSON.parse(sql(`SELECT json_build_object('count',count(*),'passed',count(*) FILTER(WHERE passed),'failed',count(*) FILTER(WHERE NOT passed),'cases',json_agg(to_jsonb(e) ORDER BY id)) FROM public.precision_expectations e;`).stdout.trim());
  check('existing-legacy-matrix',legacy.count===30&&legacy.failed===0,{actual:legacy});
 }
 const result={phase,synthetic:true,host:'127.0.0.1',port:55443,database,source_commit:'99901fedd1b83b000e6230c6750ed65576f257df',candidate_sha256:sha(candidate),fixture_sha256:sha(resolve(inputDirectory,'baseline-fixture.sql')),legacy_cases_sha256:sha(resolve(inputDirectory,'cases.sql')),checks,passed:checks.filter(v=>v.passed).length,failed:checks.filter(v=>!v.passed).length};
 const sanitized=JSON.stringify(result,null,2).replaceAll(root,'<worktree>').replaceAll(root.replaceAll('\\','/'),'<worktree>').replaceAll(resolve(root,'..'),'<task>');
 writeFileSync(resolve(directory,phase+'-results.json'),sanitized+'\n');
 console.log(`${phase}: ${result.passed}/${checks.length} checks passed; ${result.failed} failed; candidate ${result.candidate_sha256}`);
 process.exitCode=result.failed?1:0;
}catch(error){log+=`RUNNER_ERROR: ${error.stack}\n`;console.error(error.message);process.exitCode=2;}
finally{
 if(started)run('pg_ctl',['-D',data,'-m','fast','-w','-t','30','stop'],true);
 const status=run('pg_ctl',['-D',data,'status'],true);
 log+=`STOPPED_STATUS_EXPECTED_3=${status.status}\n`;
 const sanitizedLog=log.replaceAll(root,'<worktree>').replaceAll(root.replaceAll('\\','/'),'<worktree>').replaceAll(resolve(root,'..'),'<task>').replaceAll('C:\\Users\\torta','C:\\Users\\<user>');
 writeFileSync(resolve(directory,phase+'-run.txt'),sanitizedLog.split(/\r?\n/).map(line=>line.trimEnd()).join('\n'));
}
