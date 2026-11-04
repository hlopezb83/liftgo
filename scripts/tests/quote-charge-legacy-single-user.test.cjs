// Independent no-socket SQL check. This does NOT run concurrent transactions or
// authenticate through Supabase; use the normal harness/API suite for those.
if (process.env.RUN_LOCAL_QUOTE_CHARGE_SINGLE_USER !== "1") {
  throw new Error("Set RUN_LOCAL_QUOTE_CHARGE_SINGLE_USER=1 and PG_BIN for a new no-socket PostgreSQL fixture.");
}
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const bin = process.env.PG_BIN;
if (!bin || !path.isAbsolute(bin)) throw new Error("PG_BIN must name trusted installed PostgreSQL binaries.");
const parent = path.resolve(root, "../.quote-charge-single-user");
fs.mkdirSync(parent, { recursive: true });
const directory = fs.mkdtempSync(path.join(parent, "run-"));
const ddl = `
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text,slug text);
CREATE TABLE public.customers(id uuid PRIMARY KEY,name text,created_by_organization_id uuid);
CREATE TABLE public.organization_customers(organization_id uuid,customer_id uuid);
CREATE TABLE public.organization_memberships(organization_id uuid,auth_user_id uuid UNIQUE,member_type text DEFAULT 'internal');
CREATE TABLE public.user_roles(user_id uuid,role text);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(auth.jwt()->>'sub','')::uuid$$;
CREATE FUNCTION public.has_role(p_id uuid,p_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_id AND role=p_role)$$;
CREATE FUNCTION public.current_internal_organization_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT organization_id FROM organization_memberships WHERE auth_user_id=auth.uid() AND member_type='internal'$$;
CREATE FUNCTION public.is_internal_member(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM organization_memberships WHERE auth_user_id=p_id AND member_type='internal')$$;
CREATE FUNCTION public.fx_is_missing(text,numeric) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE SEQUENCE public.invoice_seq;
CREATE FUNCTION public.next_draft_invoice_number() RETURNS text LANGUAGE sql AS $$SELECT 'SYNTHETIC-'||nextval('invoice_seq')$$;
CREATE TABLE public.quotes(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid,quote_number text,start_date date,end_date date,line_items jsonb DEFAULT '[]',subtotal numeric DEFAULT 0,tax_rate numeric DEFAULT 0,tax_amount numeric DEFAULT 0,total numeric DEFAULT 0,currency text DEFAULT 'MXN');
CREATE TABLE public.bookings(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid,quote_id uuid,booking_number text,status text,recurring_billing boolean,start_date date,end_date date,last_billed_date date);
CREATE TABLE public.invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,invoice_number text,booking_id uuid,quote_id uuid,customer_id uuid,customer_name text,notes text,line_items jsonb DEFAULT '[]',subtotal numeric DEFAULT 0,tax_rate numeric DEFAULT 0,tax_amount numeric DEFAULT 0,total numeric DEFAULT 0,status text DEFAULT 'draft',due_date date,billing_period_start date,billing_period_end date,receptor_rfc text,receptor_razon_social text,receptor_regimen_fiscal text,receptor_domicilio_fiscal_cp text,uso_cfdi text,forma_pago text,metodo_pago text,moneda text DEFAULT 'MXN',tipo_cambio numeric DEFAULT 1,cfdi_status text,cfdi_uuid uuid,cancellation_status text);
CREATE TABLE public.invoice_bookings(invoice_id uuid,booking_id uuid,organization_id uuid,line_index integer,PRIMARY KEY(invoice_id,booking_id));
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated,service_role;
`;
const files = [
  "scripts/tests/quote-charge-legacy-single-user-seed.sql",
  "drizzle/migrations/0107_quote_charge_tracking.sql",
  "drizzle/migrations/0123_quote_charge_legacy_reconciliation.sql",
  "scripts/tests/quote-charge-legacy-single-user-sequential.sql",
];
const sql = [ddl, ...files.map((file) => fs.readFileSync(path.join(root, file), "utf8")),
  "SELECT 'QUOTE_CHARGE_SINGLE_USER_OK' AS result;"]
  // -j disables newline command termination. Removing empty lines also avoids
  // interactive blank-line delimiters within multi-line PL/pgSQL bodies.
  .join("\n").replace(/^[\t ]*\r?\n/gm, "");
const options = { encoding: "utf8", timeout: 60_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 };
execFileSync(path.join(bin, "initdb"), ["-D", path.join(directory, "data"), "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C"], options);
const result = spawnSync(path.join(bin, "postgres"), ["--single", "-j", "-D", path.join(directory, "data"), "postgres"], {
  ...options, input: sql, stdio: ["pipe", "pipe", "pipe"],
});
const output = (result.stdout ?? "") + (result.stderr ?? "");
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
const report = path.join(root, "reports/quote-charge-legacy-single-user.log");
fs.writeFileSync(report, output);
if (result.error) throw result.error;
assert.equal(result.status, 0, `Single-user PostgreSQL process failed; see ${report}`);
const errors = output.split(/\r?\n/).filter((line) => /\b(?:ERROR|FATAL|PANIC):/.test(line));
assert.equal(errors.length, 0, `Single-user SQL reported an error: ${errors.slice(0,3).join("\n")}; see ${report}`);
assert.match(output, /QUOTE_CHARGE_SINGLE_USER_OK/, "Single-user SQL did not reach the final marker");
assert.match(output, /QUOTE_CHARGE_SEQUENTIAL_OK/, "Sequential business checks did not reach their final marker");
console.log("PASS no-socket PostgreSQL: exact 0107 + 0123 SQL compiled and sequential business fixture completed on reduced synthetic schema");
console.log("NOT EXECUTED: RLS/ACL, two-session concurrency, full Supabase schema replay and Auth/PostgREST acceptance");
console.log(`No server was started. Diagnostics: ${directory}; SQL output: ${report}`);
