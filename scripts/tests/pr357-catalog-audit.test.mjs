import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { auditTemporaryCatalog, evaluateCatalog, TARGET_TABLES } from "./pr357-catalog-audit.mjs";

// These are evaluator/guard unit tests, NOT PostgreSQL execution or a replay.
function fixture() {
  const role = (name, extra = {}) => ({ name, superuser: false, bypass_rls: false,
    create_role: false, replication: false, ...extra });
  const effectivePrivileges = [];
  for (const table of TARGET_TABLES) {
    for (const name of ["anon", "authenticated", "service_role", "postgres"]) {
      for (const [scope, privileges] of [["table",["SELECT","INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER","MAINTAIN"]],
        ["column",["SELECT","INSERT","UPDATE","REFERENCES"]]]) {
        for (const privilege of privileges) effectivePrivileges.push({ table, role: name, scope, privilege,
          allowed: name === "postgres" || (name === "service_role" && ["SELECT","INSERT","UPDATE"].includes(privilege)) });
      }
    }
  }
  return {
    tables: TARGET_TABLES.map((name) => ({ name,kind:"r",owner:"postgres",rls_enabled:true,rls_forced:false })),
    roles: [role("anon"),role("authenticated"),role("service_role",{ bypass_rls:true }),role("postgres",{ superuser:true })],
    policies: TARGET_TABLES.slice(1).map((table) => ({ table,command:"*",permissive:true,roles:["PUBLIC"],using_false:true,check_false:true })),
    table_acl: [],column_acl: [],effective_privileges: effectivePrivileges,
    role_reachability: ["anon","authenticated","service_role","postgres"].flatMap((from_role) =>
      ["anon","authenticated","service_role","postgres"].map((reachable_role) => ({from_role,reachable_role,
        member:from_role===reachable_role,usage:from_role===reachable_role,set_role:from_role===reachable_role}))),
    memberships: [],public_schema_acl: [],default_acl: [],
    schema_privileges: ["anon","authenticated","service_role","postgres"].map((role)=>({role,usage:true,create:role==="postgres"})),
  };
}
function fails(snapshot, code) {
  const result = evaluateCatalog(snapshot);
  assert.equal(result.status,"FAIL");
  assert(result.findings.some((f) => f.code === code),JSON.stringify(result.findings));
}

test("catalog evaluator accepts only the documented table contract (mock snapshot)", () => {
  assert.equal(evaluateCatalog(fixture()).status,"PASS");
});
test("missing roles/tables, disabled RLS, and unexpected counter policies fail", () => {
  let s=fixture();s.roles=s.roles.filter((r)=>r.name!=="anon");fails(s,"MISSING_ROLE");
  s=fixture();s.tables.pop();fails(s,"MISSING_OR_AMBIGUOUS_TABLE");
  s=fixture();s.tables[0].kind="p";fails(s,"UNEXPECTED_RELATION_KIND");
  for(const table of TARGET_TABLES){s=fixture();s.tables.find((t)=>t.name===table).rls_enabled=false;fails(s,"RLS_DISABLED");}
  s=fixture();s.policies.push({...s.policies[0],table:TARGET_TABLES[0]});fails(s,"COUNTERS_POLICY_PRESENT");
});
test("every ledger policy is checked: missing, additional, permissive or wrong role/command/check fail", () => {
  for(const mutate of [
    (s)=>{s.policies.shift();},
    (s)=>{s.policies.push({...s.policies[0],using_false:false});},
    (s)=>{s.policies[0].using_false=false;},
    (s)=>{s.policies[0].check_false=false;},
    (s)=>{s.policies[0].roles=["authenticated"];},
    (s)=>{s.policies[0].command="r";},
  ]){const s=fixture();mutate(s);fails(s,"UNREVIEWED_LEDGER_POLICY");}
});
test("PUBLIC table and column ACLs are rejected independently of named-role checks", () => {
  for(const field of ["table_acl","column_acl"]){const s=fixture();s[field].push({table:TARGET_TABLES[1],grantee:"PUBLIC",privilege:"SELECT",column:field==="column_acl"?"id":undefined});fails(s,"PUBLIC_ACL_PRESENT");}
});
test("effective inherited/PUBLIC and column grants, including non-RLS table operations, fail", () => {
  for(const role of ["anon","authenticated"]){
    for(const scope of ["table","column"]){
      const base=fixture();const rows=base.effective_privileges.filter((p)=>p.role===role&&p.scope===scope);
      for(const row of rows){const s=fixture();s.effective_privileges.find((p)=>p.table===row.table&&p.role===role&&p.scope===scope&&p.privilege===row.privilege).allowed=true;fails(s,"PRODUCT_PRIVILEGE_PRESENT");}
    }
  }
});
test("incomplete privileges or missing required service privileges fail", () => {
  let s=fixture();s.effective_privileges.shift();fails(s,"INCOMPLETE_PRIVILEGE_SNAPSHOT");
  for(const privilege of ["SELECT","INSERT","UPDATE"]){s=fixture();s.effective_privileges.find((p)=>p.table===TARGET_TABLES[0]&&p.role==="service_role"&&p.scope==="table"&&p.privilege===privilege).allowed=false;fails(s,"COUNTERS_SERVICE_PRIVILEGE_MISSING");}
});
test("service ACLs require schema USAGE and a real RLS bypass path for zero-policy counters", () => {
  let s=fixture();s.roles.find((r)=>r.name==="service_role").bypass_rls=false;fails(s,"COUNTERS_SERVICE_BYPASS_MISSING");
  s=fixture();s.schema_privileges.find((p)=>p.role==="service_role").usage=false;fails(s,"COUNTERS_SERVICE_SCHEMA_USAGE_MISSING");
  s=fixture();s.roles.find((r)=>r.name==="service_role").bypass_rls=false;
  s.role_reachability.push({from_role:"service_role",reachable_role:"postgres",usage:true,set_role:false});
  assert.equal(evaluateCatalog(s).status,"PASS","Inherited ownership can bypass unforced RLS");
});
test("owner inheritance/SET ROLE and reachable superuser/BYPASSRLS are distinguished", () => {
  for(const role of ["postgres","service_role"]){const s=fixture();s.role_reachability.push({from_role:"authenticated",reachable_role:role,usage:false,set_role:true});fails(s,"PRODUCT_BYPASS_REACHABLE");}
  let s=fixture();s.role_reachability.push({from_role:"anon",reachable_role:"postgres",usage:true,set_role:false});fails(s,"PRODUCT_BYPASS_REACHABLE");
  s=fixture();s.role_reachability.push({from_role:"anon",reachable_role:"service_role",usage:true,set_role:false});assert.equal(evaluateCatalog(s).status,"PASS","BYPASSRLS attribute itself is not inherited");
});
test("SET ROLE into an intermediate role cannot hide inherited owner status or ACL", () => {
  function intermediate(){const s=fixture();s.roles.push({name:"bridge",superuser:false,bypass_rls:false});
    s.role_reachability.push({from_role:"authenticated",reachable_role:"bridge",set_role:true,usage:false});
    s.role_reachability.push({from_role:"bridge",reachable_role:"postgres",usage:false,set_role:false});
    s.effective_privileges.push(...s.effective_privileges.filter((p)=>p.role==="anon").map((p)=>({...p,role:"bridge"})));return s;}
  let s=intermediate();s.role_reachability.find((r)=>r.from_role==="bridge"&&r.reachable_role==="postgres").usage=true;fails(s,"PRODUCT_BYPASS_REACHABLE");
  s=intermediate();s.effective_privileges.find((p)=>p.role==="bridge"&&p.scope==="table"&&p.privilege==="TRUNCATE").allowed=true;fails(s,"PRODUCT_PRIVILEGE_PRESENT");
  for(const attribute of ["create_role","replication"]){s=intermediate();s.roles.find((r)=>r.name==="bridge")[attribute]=true;fails(s,"PRODUCT_ELEVATED_ATTRIBUTE");}
  s=intermediate();assert.equal(evaluateCatalog(s).status,"PASS");
});
test("product administrative attributes and forced counter RLS changes fail", () => {
  for(const attribute of ["superuser","bypass_rls","create_role","replication"]){const s=fixture();s.roles[0][attribute]=true;fails(s,"PRODUCT_ELEVATED_ATTRIBUTE");}
  const s=fixture();s.tables[0].rls_forced=true;fails(s,"COUNTERS_FORCE_RLS_CHANGED");
});
test("guard refuses a caller without an owned temporary marker before any SQL", async () => {
  const sql={begin(){throw new Error("SQL must not be reached");}};
  await assert.rejects(auditTemporaryCatalog(sql,{}),/Explicit disposable/);
});
test("guard rejects a mismatched actual database before collecting catalogs", async () => {
  const directory=mkdtempSync(join(tmpdir(),"liftgo-pr357-pg-"));const nonce=randomUUID();
  writeFileSync(join(directory,".liftgo-pr357-temporary.json"),JSON.stringify({purpose:"pr357-catalog-validation",nonce}),{mode:0o600});
  const sql={async begin(mode,fn){assert.equal(mode,"read only");return fn({async unsafe(){return [{database:"other",data_directory:join(directory,"data"),server_version_num:170004,transaction_read_only:"on",server_address:null}];}});}};
  try{await assert.rejects(auditTemporaryCatalog(sql,{clusterDirectory:directory,nonce}),/not the marked/);}finally{rmSync(directory,{recursive:true,force:true});}
});
