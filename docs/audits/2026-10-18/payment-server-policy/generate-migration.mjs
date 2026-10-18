import { readFileSync, writeFileSync } from "node:fs";

// Deterministic local generation from the read-only, pinned catalog snapshot.
// Never connects to a database. The generated SQL remains reviewable in full.
const directory = "docs/audits/2026-10-18/payment-server-policy";
const snapshot = JSON.parse(readFileSync(`${directory}/source-functions.json`, "utf8"));
const derived = JSON.parse(readFileSync(`${directory}/source-derived-function.json`, "utf8"));
const all = [...snapshot.catalog.rows[0].metadata.functions, ...snapshot.dependencies.rows[0].metadata.functions, ...derived.result.rows];
const get = (name) => all.find((entry) => entry.name === name).definition;
function replace(source, old, next) {
  if (!source.includes(old) || source.indexOf(old) !== source.lastIndexOf(old)) throw new Error(`Unexpected catalog source: ${old.slice(0, 80)}`);
  return source.replace(old, next);
}
function between(source, first, last, next) {
  const start = source.indexOf(first), end = source.indexOf(last, start);
  if (start < 0 || end < 0) throw new Error(`Missing boundaries: ${first}`);
  return source.slice(0, start) + next + source.slice(end);
}
const converted = (currency, rate, amount = "p.amount") => `public.fx_convert_amount(${amount}, COALESCE(p.currency, ${currency}, 'MXN'), ${currency}, NULLIF(p.exchange_rate, 0), NULLIF(${rate}, 0))`;

let guard = get("enforce_payment_within_invoice_total");
guard = replace(guard, "  payable NUMERIC;", "  payable NUMERIC;\n  inv_org uuid;\n  has_missing_fx boolean;");
guard = replace(guard, "SELECT total, status, moneda, tipo_cambio, metodo_pago, cfdi_status\n    INTO inv_total, inv_status, inv_moneda, inv_tc, inv_metodo, inv_cfdi", "SELECT total, status, moneda, tipo_cambio, metodo_pago, cfdi_status, organization_id\n    INTO inv_total, inv_status, inv_moneda, inv_tc, inv_metodo, inv_cfdi, inv_org");
guard = between(guard, "  SELECT COALESCE(SUM(\n      CASE", "  SELECT COALESCE(SUM(total), 0) INTO credited", `  -- Match the persisted source cents: the legacy rounding trigger sorts later.\n  SELECT COALESCE(SUM(${converted("inv_moneda", "inv_tc")}), 0),\n         COALESCE(bool_or(${converted("inv_moneda", "inv_tc")} IS NULL), false)\n    INTO total_paid, has_missing_fx\n  FROM public.payments p\n  WHERE p.invoice_id = NEW.invoice_id\n    AND COALESCE(p.organization_id, inv_org) = inv_org\n    AND (TG_OP = 'INSERT' OR p.id <> NEW.id);\n\n  new_amount := public.fx_convert_amount(round(NEW.amount, 2), COALESCE(NEW.currency, inv_moneda, 'MXN'),\n    inv_moneda, NULLIF(NEW.exchange_rate, 0), NULLIF(inv_tc, 0));\n  IF new_amount IS NULL OR has_missing_fx THEN\n    RAISE EXCEPTION 'No se puede verificar el sobrepago: falta un tipo de cambio valido para el pago o pagos existentes'\n      USING ERRCODE = 'check_violation';\n  END IF;\n\n`);
guard = replace(guard, "WHERE invoice_id = NEW.invoice_id\n    AND cfdi_status", "WHERE invoice_id = NEW.invoice_id\n    AND COALESCE(organization_id, inv_org) = inv_org\n    AND cfdi_status");

let sync = get("sync_invoice_status");
sync = replace(sync, "  v_tc numeric;", "  v_tc numeric;\n  v_missing_fx boolean;");
sync = between(sync, "  -- R4-15: pagos convertidos", "  -- N-21 / R4-15:", `  -- Same per-payment conversion/rounding as v_invoices_with_balance.\n  SELECT COALESCE(SUM(${converted("v_moneda", "v_tc")}), 0), MAX(p.payment_date),\n         COALESCE(bool_or(${converted("v_moneda", "v_tc")} IS NULL), false)\n    INTO v_paid, v_latest_date, v_missing_fx\n  FROM public.payments p\n  WHERE p.invoice_id = v_invoice_id\n    AND COALESCE(p.organization_id, v_invoice_org) = v_invoice_org;\n\n  -- Unknown money must not manufacture a paid status. Leave it unchanged so\n  -- non-fiscal notes and repair/deletion of legacy bad-FX payments remain possible.\n  IF v_missing_fx THEN RETURN; END IF;\n\n`);

let integrity = get("guard_invoice_status_integrity");
integrity = between(integrity, "    IF EXISTS (", "    SELECT COALESCE(SUM(cn.total), 0)", `    IF EXISTS (\n      SELECT 1 FROM public.payments p\n      WHERE p.invoice_id = NEW.id\n        AND COALESCE(p.organization_id, NEW.organization_id) = NEW.organization_id\n        AND ${converted("v_invoice_currency", "NEW.tipo_cambio")} IS NULL\n    ) THEN\n      RAISE EXCEPTION 'No se puede marcar la factura como pagada: hay pagos sin tipo de cambio valido.'\n        USING ERRCODE = 'check_violation';\n    END IF;\n\n    SELECT COALESCE(SUM(${converted("v_invoice_currency", "NEW.tipo_cambio")}), 0)\n      INTO v_paid FROM public.payments p\n    WHERE p.invoice_id = NEW.id\n      AND COALESCE(p.organization_id, NEW.organization_id) = NEW.organization_id;\n\n`);
integrity = replace(integrity, "WHERE cn.invoice_id = NEW.id\n      AND cn.cfdi_status", "WHERE cn.invoice_id = NEW.id\n      AND COALESCE(cn.organization_id, NEW.organization_id) = NEW.organization_id\n      AND cn.cfdi_status");

let credit = get("enforce_credit_note_max");
credit = between(credit, "       AND upper(COALESCE(p.currency", "  v_rep_backed := round", `       AND ${converted("v_inv_moneda", "v_inv_tc")} IS NULL\n  ) THEN\n    RAISE EXCEPTION 'Hay pagos con REP timbrado sin tipo de cambio valido; captura el tipo de cambio antes de emitir la nota de credito.'\n      USING ERRCODE = 'check_violation';\n  END IF;\n\n  -- Keep the existing live-REP cap; only its conversion becomes canonical.\n  SELECT COALESCE(SUM(${converted("v_inv_moneda", "v_inv_tc")}), 0) INTO v_rep_backed\n    FROM payments p\n   WHERE p.invoice_id = NEW.invoice_id\n     AND p.rep_cfdi_status = 'stamped'\n     AND p.rep_cancelled_at IS NULL;\n\n`);

let currencyGuard = get("enforce_payment_matches_invoice_currency");
currencyGuard = replace(currencyGuard, "SELECT COALESCE(moneda, 'MXN'), tipo_cambio", "SELECT upper(COALESCE(moneda, 'MXN')), tipo_cambio");
currencyGuard = replace(currencyGuard, "pay_currency := COALESCE(NEW.currency, 'MXN');", "pay_currency := upper(COALESCE(NEW.currency, inv_currency, 'MXN'));");
currencyGuard = replace(currencyGuard, "IF COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(inv_tc, 0)) IS NULL THEN", "IF public.fx_convert_amount(round(NEW.amount, 2), pay_currency, inv_currency, NULLIF(NEW.exchange_rate, 0), NULLIF(inv_tc, 0)) IS NULL THEN");

const invalid = (expression) => `(${expression} IS NULL OR (${expression})::text IN ('NaN','Infinity','-Infinity'))`;
const unchanged = `  -- Idempotent form payloads may include amount when editing only notes.\n  -- Keep subsequent REP/date/organization triggers active; skip money-only work.\n  IF TG_OP = 'UPDATE' AND ROW(NEW.amount, NEW.currency, NEW.exchange_rate, NEW.invoice_id)\n      IS NOT DISTINCT FROM ROW(OLD.amount, OLD.currency, OLD.exchange_rate, OLD.invoice_id) THEN\n    RETURN NEW;\n  END IF;\n\n`;
guard = replace(guard, "BEGIN\n  PERFORM pg_advisory_xact_lock", `BEGIN\n${unchanged}  PERFORM pg_advisory_xact_lock`);
guard = replace(guard, `bool_or(${converted("inv_moneda", "inv_tc")} IS NULL)`, `bool_or(${invalid(converted("inv_moneda", "inv_tc"))})`);
guard = replace(guard, "IF new_amount IS NULL OR has_missing_fx THEN", `IF ${invalid("new_amount")} OR has_missing_fx THEN`);
guard = replace(guard, "IF total_paid > payable THEN", "IF payable::text IN ('NaN','Infinity','-Infinity') OR total_paid > payable THEN");
sync = replace(sync, `bool_or(${converted("v_moneda", "v_tc")} IS NULL)`, `bool_or(${invalid(converted("v_moneda", "v_tc"))})`);
for (const field of ["v_total", "v_paid", "v_credited"]) sync = replace(sync, `  ${field} numeric(14,2);`, `  ${field} numeric;`);
sync = replace(sync, "  PERFORM set_config('app.payment_sync'", "  IF v_total::text IN ('NaN','Infinity','-Infinity') OR v_credited::text IN ('NaN','Infinity','-Infinity') THEN RETURN; END IF;\n\n  PERFORM set_config('app.payment_sync'");
integrity = replace(integrity, `${converted("v_invoice_currency", "NEW.tipo_cambio")} IS NULL`, invalid(converted("v_invoice_currency", "NEW.tipo_cambio")));
integrity = replace(integrity, "    IF v_remaining > 0.005 THEN", "    IF NEW.total::text IN ('NaN','Infinity','-Infinity') OR v_credited::text IN ('NaN','Infinity','-Infinity') OR v_remaining > 0.005 THEN");
credit = replace(credit, `${converted("v_inv_moneda", "v_inv_tc")} IS NULL`, invalid(converted("v_inv_moneda", "v_inv_tc")));
currencyGuard = replace(currencyGuard, "BEGIN\n  SELECT", `BEGIN\n${unchanged}  SELECT`);

let amountMxn = get("trg_payment_amount_mxn");
amountMxn = replace(amountMxn, "      NEW.amount * COALESCE", "      round(NEW.amount, 2) * COALESCE");
amountMxn = replace(amountMxn, "      COALESCE(NEW.amount, 0) * COALESCE", "      round(COALESCE(NEW.amount, 0), 2) * COALESCE");
// Preserve a legacy derived amount on an idempotent form payload; do not try to
// reprice invalid historical FX merely because a user changed the notes.
amountMxn = replace(amountMxn, "BEGIN\n  SELECT", `BEGIN\n${unchanged.replace("RETURN NEW;", "NEW.amount_mxn := OLD.amount_mxn;\n    RETURN NEW;")}  SELECT`);

const names = ["enforce_payment_within_invoice_total", "sync_invoice_status", "guard_invoice_status_integrity", "enforce_credit_note_max", "enforce_payment_matches_invoice_currency", "trg_payment_amount_mxn"];
const header = `-- N7/N8: canonical per-payment invoice-currency cents. Forward-only.\n-- No GRANT/REVOKE, data rewrite, REP bypass or change of function ownership.\n-- Requires existing canonical fx_convert_amount and the current org-scoped schema.\n`;
const trigger = "CREATE OR REPLACE TRIGGER trg_enforce_payment_within_invoice_total\nBEFORE INSERT OR UPDATE OF amount, invoice_id, currency, exchange_rate ON public.payments\nFOR EACH ROW EXECUTE FUNCTION public.enforce_payment_within_invoice_total();\n--> statement-breakpoint\nCREATE OR REPLACE TRIGGER trg_payments_amount_mxn\nBEFORE INSERT OR UPDATE OF amount, invoice_id, currency, exchange_rate ON public.payments\nFOR EACH ROW EXECUTE FUNCTION public.trg_payment_amount_mxn();\n";
writeFileSync("drizzle/migrations/0103_canonical_payment_invoice_currency.sql", `${header}\n${[guard, sync, integrity, credit, currencyGuard, amountMxn].map((f) => f.trim() + ";\n--> statement-breakpoint\n").join("\n")}\n${trigger}`);
const oldTrigger = snapshot.catalog.rows[0].metadata.payment_triggers.find((t) => t.name === "trg_enforce_payment_within_invoice_total").definition;
const oldDerivedTrigger = snapshot.catalog.rows[0].metadata.payment_triggers.find((t) => t.name === "trg_payments_amount_mxn").definition;
writeFileSync(`${directory}/rollback-reviewed-functions.sql`, `-- PROPOSAL ONLY: compensating definition rollback; never reverse/delete ledger.\n-- Revalidate fingerprint/ownership first. No data changes; restores prior bugs.\nBEGIN;\n${names.map((name) => get(name).trim() + ";").join("\n\n")}\nCREATE OR REPLACE ${oldTrigger.slice("CREATE ".length)};\nCREATE OR REPLACE ${oldDerivedTrigger.slice("CREATE ".length)};\nCOMMIT;\n`);
console.log("Generated six replacement functions, two trigger replacements and definition-only rollback; no database connection.");
