import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const cases = [];
const add = (id, seed, patch, expected, persisted = {}, profile = "versioned-typmods", metadata = false) => cases.push({ id, seed, patch, expected, persisted, profile, metadata });
const meta = { description: "description edited" };
add("typed_metadata_full_identical", {}, meta, "00000", meta, undefined, true);
add("typed_legacy_formula_mismatch_metadata", { total: 90 }, meta, "00000", { ...meta, total: 90 }, undefined, true);
add("typed_approved_formula_mismatch_metadata", { total: 90, approval_status: "approved" }, meta, "00000", { ...meta, total: 90 }, undefined, true);
add("typed_fractional_subtotal_normalizes", {}, { ...meta, subtotal: 100.001 }, "00000", { subtotal: 100, total: 100 });
add("typed_fractional_rate_normalizes", {}, { ...meta, exchange_rate: 17.1234567 }, "00000", { exchange_rate: 17.123457, total: 100 });
add("typed_fractional_discount_normalizes", {}, { ...meta, discount: 10.001, total: 90 }, "00000", { discount: 10, total: 90 });
add("typed_approved_raw_subtotal_change_locked", { approval_status: "approved" }, { ...meta, subtotal: 100.001 }, "23514");
add("typed_approved_raw_rate_change_locked", { approval_status: "approved" }, { ...meta, exchange_rate: 17.50000001 }, "23514");
add("typed_approved_raw_discount_change_locked", { approval_status: "approved", discount: 10, total: 90 }, { ...meta, discount: 10.001 }, "23514");
add("typed_approved_full_identical_metadata", { approval_status: "approved" }, meta, "00000", meta, undefined, true);
add("typed_fractional_components_inconsistent_final_total", {}, { subtotal: 100.004, tax_amount: 0.004, total: 100.01 }, "23514");
add("typed_negative_fraction_before_coercion", {}, { discount: -0.001 }, "23514");
add("typed_rate_rounds_to_zero_rejected", {}, { exchange_rate: 0.0000001 }, "23514");
add("typed_unknown_key_rejected", {}, { unknown_field: 1 }, "22023");
add("typed_numeric_string_rejected", {}, { subtotal: "100" }, "22023");
add("typed_discount_change_requires_explicit_total", {}, { discount: 10 }, "22023");
cases[cases.length - 1].sparse = true;
add("typed_discount_cannot_exceed_subtotal", {}, { discount: 101, total: 0 }, "23514");
const legacy = "hypothetical-bare-numeric";
add("legacy_rate_identical_metadata", { exchange_rate: 17.1234567 }, meta, "00000", meta, legacy, true);
add("legacy_subtotal_identical_metadata", { subtotal: 100.001 }, meta, "00000", meta, legacy, true);
add("legacy_discount_identical_metadata", { discount: 10.001, total: 89.999 }, meta, "00000", meta, legacy, true);
add("legacy_tax_identical_metadata", { tax_amount: 0.001, total: 100.001 }, meta, "00000", meta, legacy, true);
add("legacy_retention_iva_identical_metadata", { retention_iva: 0.001, total: 99.999 }, meta, "00000", meta, legacy, true);
add("legacy_retention_isr_identical_metadata", { retention_isr: 0.001, total: 99.999 }, meta, "00000", meta, legacy, true);
add("legacy_total_identical_metadata", { total: 100.001 }, meta, "00000", meta, legacy, true);
add("legacy_approved_rate_identical_metadata", { approval_status: "approved", exchange_rate: 17.1234567 }, meta, "00000", meta, legacy, true);
add("legacy_approved_amounts_identical_metadata", { approval_status: "approved", subtotal: 100.001, total: 100.001 }, meta, "00000", meta, legacy, true);
add("legacy_rate_identical_real_discount_change", { exchange_rate: 17.1234567 }, { discount: 10, total: 90 }, "00000", { exchange_rate: 17.1234567, discount: 10, total: 90 }, legacy);
add("legacy_new_precision_follows_existing_type", {}, { discount: 10.001, total: 90 }, "00000", { discount: 10.001, total: 90 }, legacy);
add("legacy_approved_real_subtotal_change_locked", { approval_status: "approved", subtotal: 100.001 }, { subtotal: 100.002 }, "23514", {}, legacy);
add("legacy_sparse_metadata_control", { exchange_rate: 17.1234567, total: 100.001 }, meta, "00000", meta, legacy, true);
cases[cases.length - 1].sparse = true;

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const fullKeys = ["supplier_id", "category", "description", "issue_date", "due_date", "coverage_start", "coverage_end", "currency", "exchange_rate", "subtotal", "discount", "tax_amount", "retention_iva", "retention_isr", "total", "cfdi_uuid", "payment_method_sat", "cfdi_xml_url"];
const header = `\\set ON_ERROR_STOP on
-- LOCAL SYNTHETIC FIXTURE ONLY. This file never targets application data.
CREATE TABLE public.precision_expectations(id text PRIMARY KEY, profile text, expected text, actual text, passed boolean, message text, before_row jsonb, after_row jsonb);
GRANT INSERT,SELECT ON public.precision_expectations TO authenticated;
CREATE FUNCTION pg_temp.observe(id text,profile text,bill uuid,patch jsonb,expected text,persisted jsonb,metadata boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE before_image jsonb; after_image jsonb; code text:='00000'; msg text:='accepted'; result uuid; ok boolean;
BEGIN
 SELECT to_jsonb(b) INTO before_image FROM public.supplier_bills b WHERE b.id=bill;
 BEGIN result:=public.update_supplier_bill_details(bill,patch);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,msg=MESSAGE_TEXT; END;
 SELECT to_jsonb(b) INTO after_image FROM public.supplier_bills b WHERE b.id=bill;
 ok:=code=expected AND CASE WHEN code='00000' THEN result=bill AND after_image @> persisted
   AND (NOT metadata OR (after_image-'description'-'updated_at') IS NOT DISTINCT FROM (before_image-'description'-'updated_at'))
   ELSE after_image IS NOT DISTINCT FROM before_image END;
 INSERT INTO public.precision_expectations VALUES(id,profile,expected,code,ok,msg,before_image,after_image);
 RAISE NOTICE '% % expected=% actual=%',CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END,id,expected,code;
END $$;
`;
let output = header;
let lastProfile = "versioned-typmods";
cases.forEach((test, index) => {
  if (test.profile !== lastProfile) {
    output += `\nRESET ROLE;
-- Explicit compatibility experiment. The versioned schema above cannot store
-- this precision. This widening is synthetic and is NOT an application proposal.
DO $$
DECLARE definitions text[]; trigger_name text; definition text;
BEGIN
 SELECT array_agg(pg_get_triggerdef(oid) ORDER BY tgname) INTO definitions
 FROM pg_trigger WHERE tgrelid='public.supplier_bills'::regclass AND NOT tgisinternal;
 FOR trigger_name IN SELECT tgname FROM pg_trigger WHERE tgrelid='public.supplier_bills'::regclass AND NOT tgisinternal LOOP
  EXECUTE format('DROP TRIGGER %I ON public.supplier_bills',trigger_name);
 END LOOP;
 ALTER TABLE public.supplier_bills
  ALTER COLUMN subtotal TYPE numeric, ALTER COLUMN discount TYPE numeric,
  ALTER COLUMN tax_amount TYPE numeric, ALTER COLUMN retention_iva TYPE numeric,
  ALTER COLUMN retention_isr TYPE numeric, ALTER COLUMN total TYPE numeric,
  ALTER COLUMN exchange_rate TYPE numeric;
 FOREACH definition IN ARRAY definitions LOOP EXECUTE definition; END LOOP;
END $$;
`;
    lastProfile = test.profile;
  }
  const bill = `00000000-0000-4000-8000-${String(900 + index).padStart(12, "0")}`;
  const base = { id: bill, bill_number: `SYNTHETIC-PRECISION-${index}`, supplier_id: "00000000-0000-4000-8000-000000000301", category: "renta", description: "before", issue_date: "2026-10-18", currency: "USD", exchange_rate: 17.5, subtotal: 100, discount: 0, tax_amount: 0, retention_iva: 0, retention_isr: 0, total: 100, organization_id: "00000000-0000-4000-8000-000000000101", approval_status: "not_required", ...test.seed };
  const columns = Object.keys(base);
  const values = columns.map((key) => typeof base[key] === "number" ? String(base[key]) : quote(base[key]));
  output += `\nRESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
INSERT INTO public.supplier_bills(${columns.join(",")}) VALUES(${values.join(",")});
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT pg_temp.observe(${quote(test.id)},${quote(test.profile)},${quote(bill)},
 ${test.sparse ? json(test.patch) : `(SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(b)) WHERE key=ANY(ARRAY[${fullKeys.map(quote).join(",")}])) || ${json(test.patch)}`},
 ${quote(test.expected)},${json(test.persisted)},${test.metadata ? "true" : "false"})${test.sparse ? ";" : ` FROM public.supplier_bills b WHERE b.id=${quote(bill)};`}
`;
});
output += "\nRESET ROLE;\n";
writeFileSync(resolve(directory, "cases.json"), JSON.stringify(cases, null, 2) + "\n");
writeFileSync(resolve(directory, "cases.sql"), output);
console.log(`Generated ${cases.length} precision expectations, unchanged across phases.`);
