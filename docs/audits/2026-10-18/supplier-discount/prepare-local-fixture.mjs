import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Local-only subset: real repository DDL plus captured catalog definitions.
// This generator never connects to a database. See README for omitted objects.
const read = (path) => readFileSync(resolve(path), "utf8");
const directory = "docs/audits/2026-10-18/supplier-discount";
const aclSnapshot = JSON.parse(read(`${directory}/remote-current-acl.json`)).result.rows[0].metadata;
const guardsSnapshot = JSON.parse(read(`${directory}/remote-current-guards.json`)).result.rows[0].metadata;
const businessSnapshot = JSON.parse(read(`${directory}/remote-current-business-guards.json`)).result.rows;
function extractFunction(path, name) {
  const source = read(path);
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const remainder = source.slice(start);
  const body = /\bAS\s+(\$\w*\$)/i.exec(remainder);
  if (!body) throw new Error(`Missing body ${name}`);
  const end = remainder.indexOf(`${body[1]};`, body.index + body[0].length);
  if (end < 0) throw new Error(`Missing terminator ${name}`);
  return remainder.slice(0, end + body[1].length + 1);
}
function extractTable(path, name) {
  const source = read(path);
  const start = source.indexOf(`CREATE TABLE public.${name} (`);
  const end = source.indexOf("\n);", start);
  if (start < 0 || end < 0) throw new Error(`Missing table ${name}`);
  return source.slice(start, end + 3);
}
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
const policies = aclSnapshot.policies.map((policy) => `CREATE POLICY ${identifier(policy.name)}
 ON public.supplier_bills AS ${policy.permissive} FOR ${policy.command} TO ${policy.roles.map(identifier).join(", ")}
 USING (${policy.using})${policy.check ? ` WITH CHECK (${policy.check})` : ""};`).join("\n");
// SQL-language helpers resolve dependencies at CREATE FUNCTION time.
const helperOrder = ["is_active_user", "has_role", "current_organization_id", "is_admin_or_administrativo", "organization_scope_matches"];
const definitions = [...helperOrder.map((name) => {
  const helper = guardsSnapshot.access_helpers.find((entry) => entry.name === name);
  if (!helper) throw new Error(`Missing captured helper ${name}`);
  return helper;
}), ...businessSnapshot];
const definedFunctions = new Set(definitions.map((entry) => entry.name));
const triggers = guardsSnapshot.triggers.filter((trigger) => definedFunctions.has(trigger.function) || trigger.function === "trg_supplier_bill_init_balance");
if (definitions.length !== 14 || triggers.length !== 10) throw new Error("Unexpected captured fixture definition inventory");
const initialPath = "supabase/migrations/20260608221347_c60cea8b-c61d-461f-b863-8d36be5fada6.sql";
const aclPath = "supabase/migrations/20260729204701_a3db1c09-d144-4423-8e0b-4d9ed5a8909f.sql";
const discountPath = "supabase/migrations/20260811185738_a6781c40-01f6-4e66-8861-407aa6eba1fc.sql";
const initial = read(initialPath);
const acl = read(aclPath);
const grantStart = acl.indexOf("REVOKE UPDATE ON public.supplier_bills FROM authenticated;");
const paymentPoliciesStart = initial.indexOf('CREATE POLICY "SupPay: admin/administrativo full"');
const paymentPoliciesEnd = initial.indexOf("-- ---------- Numbering:", paymentPoliciesStart);
const baseConstraints = new Set(["supplier_bills_created_by_fkey", "supplier_bills_currency_check", "supplier_bills_discount_non_negative_chk", "supplier_bills_payment_method_sat_check", "supplier_bills_pkey", "supplier_bills_supplier_id_fkey", "supplier_bills_total_check"]);
const extraConstraints = aclSnapshot.constraints.filter((constraint) => !baseConstraints.has(constraint.name))
  .map((constraint) => `ALTER TABLE public.supplier_bills ADD CONSTRAINT ${identifier(constraint.name)} ${constraint.definition};`).join("\n");
const roleNames = ["admin", "administrativo", "ventas", "auditor", "mechanic", "dispatcher", "customer", "admin", "admin", "admin"];
const uid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const users = roleNames.map((role, index) => `('${uid(index + 1)}', '${role}')`).join(",\n");
const memberships = roleNames.flatMap((_, index) => index === 8 ? [] : [`('${uid(index + 1)}', '${uid(index === 9 ? 102 : 101)}', 'internal')`]).join(",\n");
const sql = `-- Generated from audited source; run ONLY in a fresh local fixture database.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(auth.jwt()->>'sub', '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;
CREATE TYPE public.app_role AS ENUM ('admin','administrativo','ventas','auditor','mechanic','dispatcher','customer');
CREATE TYPE public.expense_category AS ENUM ('other');
CREATE TYPE public.supplier_bill_status AS ENUM ('draft','pending','partial','paid','overdue','cancelled');
CREATE TYPE public.supplier_bill_approval_status AS ENUM ('not_required','pending','approved','rejected');
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.suppliers (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE TABLE public.user_roles (user_id uuid PRIMARY KEY, role public.app_role);
CREATE TABLE public.organizations (id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE TABLE public.organization_memberships (auth_user_id uuid UNIQUE, organization_id uuid, member_type text);
CREATE TABLE public.company_settings (organization_id uuid PRIMARY KEY, cxp_approval_threshold_mxn numeric(14,2));
GRANT SELECT ON public.company_settings TO authenticated;
${extractTable(initialPath, "supplier_bills")}
ALTER TABLE public.supplier_bills
 ADD COLUMN cfdi_xml_url text, ADD COLUMN receptor_rfc text,
 ADD COLUMN tipo_comprobante text, ADD COLUMN coverage_start date,
 ADD COLUMN coverage_end date, ADD COLUMN payment_in_progress_at timestamptz,
 ADD COLUMN organization_id uuid,
 ADD COLUMN approval_status public.supplier_bill_approval_status NOT NULL DEFAULT 'not_required',
 ADD COLUMN approved_by uuid, ADD COLUMN approved_at timestamptz,
 ADD COLUMN approval_notes text;
${read(discountPath)}
ALTER TABLE public.supplier_bills DROP CONSTRAINT supplier_bills_bill_number_key;
${extraConstraints}
${extractTable(initialPath, "supplier_payments")}
ALTER TABLE public.supplier_payments ADD COLUMN organization_id uuid;
${definitions.map((entry) => `-- Captured catalog definition: ${entry.name}\n${entry.definition.trim()};`).join("\n")}
${extractFunction("supabase/migrations/20260731235443_7b2ca674-f6e0-4b98-95b9-1039fa28abfb.sql", "today_mty")}
${extractFunction("supabase/migrations/20260901080020_f395aa5e-1e0c-4dd0-a311-4ff8b1b5ed60.sql", "fx_is_missing")}
${extractFunction("supabase/migrations/20260814044428_963e504b-79a0-4ec0-a30b-c5143ad9eed2.sql", "trg_supplier_bill_init_balance")}
${extractFunction("supabase/migrations/20260825222954_5baa924c-295a-47e5-9ddf-cbea11eb18a5.sql", "recalc_supplier_bill")}
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_bills TO authenticated;
ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_bills FORCE ROW LEVEL SECURITY;
${policies}
GRANT SELECT ON public.supplier_payments TO authenticated;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
${initial.slice(paymentPoliciesStart, paymentPoliciesEnd)}
CREATE POLICY org_scope_isolation ON public.supplier_payments AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.organization_scope_matches(organization_id)))
 WITH CHECK ((SELECT public.organization_scope_matches(organization_id)));
${triggers.map((trigger) => `${trigger.definition};`).join("\n")}
${acl.slice(grantStart)}
INSERT INTO public.user_roles VALUES ${users};
INSERT INTO auth.users SELECT user_id FROM public.user_roles;
INSERT INTO public.profiles SELECT user_id, user_id <> '${uid(8)}'::uuid FROM public.user_roles;
INSERT INTO public.organizations VALUES ('${uid(101)}',true),('${uid(102)}',true);
INSERT INTO public.organization_memberships VALUES ${memberships};
INSERT INTO public.company_settings VALUES ('${uid(101)}',1000),('${uid(102)}',2000);
-- Synthetic seed only: postgres owns this disposable DB, not an application user.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(id,bill_number,total,subtotal,organization_id,approval_status)
 VALUES ('${uid(201)}','SYNTHETIC-A',100,100,'${uid(101)}','not_required'),
 ('${uid(202)}','SYNTHETIC-B',100,100,'${uid(102)}','not_required'),
 ('${uid(203)}','SYNTHETIC-APPROVED',200,200,'${uid(101)}','approved'),
 ('${uid(204)}','SYNTHETIC-PARTIAL',100,100,'${uid(101)}','not_required'),
 ('${uid(205)}','SYNTHETIC-PAID',100,100,'${uid(101)}','not_required');
INSERT INTO public.supplier_payments(bill_id,amount,organization_id)
 VALUES ('${uid(204)}',20,'${uid(101)}'),('${uid(205)}',100,'${uid(101)}');
SELECT public.recalc_supplier_bill('${uid(204)}');
SELECT public.recalc_supplier_bill('${uid(205)}');
SELECT set_config('app.cxp_recalc','off',false),set_config('request.jwt.claims','{}',false),set_config('app.organization_id','',false);
`;
const target = `${directory}/local-fixture.generated.sql`;
writeFileSync(target, sql);
console.log(`Wrote ${target}; partial fixture: real DDL, ${definitions.length} captured functions, ${triggers.length} captured triggers, current bill policies/constraints. No database connection.`);
