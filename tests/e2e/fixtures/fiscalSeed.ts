import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAuthToken } from "./helpers";

/**
 * Fixtures E2E adicionales para flujos fiscales (timbrado, cancelación, REP,
 * NC). Complementa `seed.ts` — no lo reemplaza.
 *
 * IMPORTANTE: los flujos fiscales reales NO se ejecutan contra Facturapi live
 * en CI. Se espera `FACTURAPI_TEST_KEY` (modo test/stub) o `E2E_MOCK_PAC=1`
 * para que `stamp-cfdi` devuelva un UUID mock. Ver stamp-cfdi/handler.ts
 * (rama "stub mode").
 */
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("[e2e] VITE_SUPABASE_URL/PUBLISHABLE_KEY requeridos");
}

async function client(page: Page): Promise<SupabaseClient> {
  const token = await getAuthToken(page);
  if (!token) throw new Error("[e2e] sin auth token; corre global.setup primero");
  return createClient(SUPABASE_URL as string, SUPABASE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export interface FiscalSeed {
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  total: number;
  scope: string;
  metodo_pago: "PUE" | "PPD";
}

/**
 * Crea una factura E2E lista para timbrar. Reusa `e2e_seed_scenario` si
 * expone metodo_pago; en su ausencia hace un UPDATE para forzar PUE/PPD.
 *
 * ⚠️ Estas facturas llevan `is_e2e=true`. `stamp-cfdi` las RECHAZA con 403.
 * Los specs fiscales deben usar la ruta stub (sin FACTURAPI_TEST_KEY) o un
 * seed dedicado con `is_e2e=false` gated por env de CI.
 */
export async function seedInvoiceForStamping(
  page: Page,
  opts: { metodo: "PUE" | "PPD"; scope: string },
): Promise<FiscalSeed> {
  const sb = await client(page);
  const { data, error } = await sb.rpc("e2e_seed_scenario", { p_scope: opts.scope });
  if (error) throw new Error(`e2e_seed_scenario: ${error.message}`);
  const seed = data as { invoice_id: string; invoice_number: string; customer_id: string; total: number; scope: string };

  const { error: updErr } = await sb
    .from("invoices")
    .update({ metodo_pago: opts.metodo, forma_pago: opts.metodo === "PPD" ? "99" : "03" })
    .eq("id", seed.invoice_id);
  if (updErr) throw new Error(`update metodo_pago: ${updErr.message}`);

  return { ...seed, metodo_pago: opts.metodo };
}

/**
 * Marca una factura como timbrada con UUID mock — útil para probar
 * cancelación / REP sin llamar Facturapi. Solo válido en E2E.
 */
export async function markStampedMock(page: Page, invoiceId: string): Promise<string> {
  const sb = await client(page);
  const uuid = crypto.randomUUID();
  const { error } = await sb
    .from("invoices")
    .update({
      cfdi_status: "stamped",
      cfdi_uuid: uuid,
      status: "sent",
      facturapi_env: "test",
    })
    .eq("id", invoiceId);
  if (error) throw new Error(`markStampedMock: ${error.message}`);
  return uuid;
}
