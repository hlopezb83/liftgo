import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// A small, real PostgreSQL ACL/RLS fixture. It extracts the applicable
// definitions from the audited repository instead of rewriting its policies.
// It does NOT reconstruct the entire Supabase schema or prove deployed ACLs.
const read = (path) => readFileSync(resolve(path), "utf8");
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
const initialPath = "supabase/migrations/20260608221347_c60cea8b-c61d-461f-b863-8d36be5fada6.sql";
const aclPath = "supabase/migrations/20260729204701_a3db1c09-d144-4423-8e0b-4d9ed5a8909f.sql";
const activePath = "supabase/migrations/20260826064202_ef2522e8-eca3-44b8-a9b3-e81a9f3a7767.sql";
const orgPath = "drizzle/migrations/0025_multi_org_phase8_admin_membership_scope.sql";
const scopePath = "drizzle/migrations/0031_multi_org_audit_hardening.sql";
const initial = read(initialPath);
const acl = read(aclPath);
const tableStart = initial.indexOf("CREATE TABLE public.supplier_bills (");
const tableEnd = initial.indexOf("\n);", tableStart) + 3;
const policyStart = initial.indexOf('CREATE POLICY "Bills: admin/administrativo full"');
const policyEnd = initial.indexOf("CREATE TRIGGER update_supplier_bills_updated_at", policyStart);
const triggerStart = acl.indexOf("DROP TRIGGER IF EXISTS trg_guard_supplier_bill_approval");
const grantStart = acl.indexOf("REVOKE UPDATE ON public.supplier_bills FROM authenticated;");
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
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.suppliers (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE TABLE public.user_roles (user_id uuid PRIMARY KEY, role public.app_role);
CREATE TABLE public.organizations (id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE TABLE public.organization_memberships (auth_user_id uuid UNIQUE, organization_id uuid, member_type text);
${initial.slice(tableStart, tableEnd)}
ALTER TABLE public.supplier_bills
 ADD COLUMN discount numeric(14,2) NOT NULL DEFAULT 0,
 ADD COLUMN cfdi_xml_url text, ADD COLUMN receptor_rfc text,
 ADD COLUMN tipo_comprobante text, ADD COLUMN coverage_start date,
 ADD COLUMN coverage_end date, ADD COLUMN payment_in_progress_at timestamptz,
 ADD COLUMN organization_id uuid,
 ADD COLUMN approval_status text NOT NULL DEFAULT 'pending',
 ADD COLUMN approved_by uuid, ADD COLUMN approved_at timestamptz,
 ADD COLUMN approval_notes text;
${extractFunction(activePath, "is_active_user")}
${extractFunction(activePath, "has_role")}
${extractFunction(orgPath, "current_organization_id")}
${extractFunction(scopePath, "organization_scope_matches")}
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_bills TO authenticated;
ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
${initial.slice(policyStart, policyEnd)}
CREATE POLICY org_scope_isolation ON public.supplier_bills AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.organization_scope_matches(organization_id)))
 WITH CHECK ((SELECT public.organization_scope_matches(organization_id)));
${extractFunction(aclPath, "guard_supplier_bill_approval")}
${acl.slice(triggerStart, grantStart)}
${acl.slice(grantStart)}
INSERT INTO public.user_roles VALUES ${users};
INSERT INTO auth.users SELECT user_id FROM public.user_roles;
INSERT INTO public.profiles SELECT user_id, user_id <> '${uid(8)}'::uuid FROM public.user_roles;
INSERT INTO public.organizations VALUES ('${uid(101)}',true),('${uid(102)}',true);
INSERT INTO public.organization_memberships VALUES ${memberships};
INSERT INTO public.supplier_bills(id,bill_number,total,subtotal,organization_id)
 VALUES ('${uid(201)}','SYNTHETIC-A',100,100,'${uid(101)}'),('${uid(202)}','SYNTHETIC-B',100,100,'${uid(102)}');
`;
const target = "docs/audits/2026-10-18/supplier-discount/local-fixture.generated.sql";
writeFileSync(target, sql);
console.log(`Wrote ${target}; schema subset only, sourced from ${initialPath}, ${aclPath}, ${activePath}, ${orgPath}, ${scopePath}`);
