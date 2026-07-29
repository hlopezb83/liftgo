import { test as base, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAuthToken } from "./helpers";

/**
 * Fixture de conciliación bancaria.
 *
 * Las tablas `bank_accounts` / `bank_statement_imports` / `bank_statement_lines`
 * NO tienen columnas `is_e2e` / `e2e_scope`, así que el purgado global
 * (`purge_e2e_data`) no las alcanza. Por eso este fixture limpia SIEMPRE por id
 * al terminar el test, pase o falle, y además barre cuentas huérfanas marcadas
 * con `TMP_E2E_` de corridas anteriores que hayan muerto a medias.
 *
 * Conciliar una línea solo escribe en `bank_statement_lines` (ver
 * `confirm_bank_match`), nunca en `payments`, así que apuntar a un pago real
 * existente es seguro: al borrar las líneas la BD queda exactamente igual.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "[e2e] VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY son obligatorios para bankSeed.",
  );
}

const TMP_PREFIX = "TMP_E2E_BANK";
const ORPHAN_MAX_AGE_MS = 6 * 60 * 60 * 1_000;

export type BankSeedIds = {
  scope: string;
  accountId: string;
  accountName: string;
  importId: string;
  /** Línea con candidato de monto exacto (abono contra un pago real). */
  exactLineId: string;
  exactAmount: number;
  exactRef: string;
  /** Abono sin candidatos posibles (monto imposible). */
  orphanLineId: string;
  orphanRef: string;
  /** Cargo (comisión bancaria) pensado para ignorarse. */
  chargeLineId: string;
  chargeRef: string;
};

async function clientFromPage(page: Page): Promise<SupabaseClient> {
  const token = await getAuthToken(page);
  if (!token) {
    throw new Error("[e2e] No hay token de Supabase. ¿Corrió global.setup?");
  }
  return createClient(SUPABASE_URL as string, SUPABASE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function buildScope(testInfo: TestInfo): string {
  const worker = testInfo.workerIndex ?? 0;
  const rand = Math.random().toString(36).slice(2, 8);
  return `w${worker}-${testInfo.testId.slice(0, 6)}-${rand}`;
}

/** Borra cuentas temporales huérfanas de corridas previas (y su cascada). */
async function sweepOrphans(client: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - ORPHAN_MAX_AGE_MS).toISOString();
  const { data } = await client
    .from("bank_accounts")
    .select("id")
    .like("notes", `${TMP_PREFIX}%`)
    .lt("created_at", cutoff);
  const ids = (data ?? []).map((a: { id: string }) => a.id);
  if (ids.length === 0) return;
  await client.from("bank_statement_lines").delete().in("bank_account_id", ids);
  await client.from("bank_statement_imports").delete().in("bank_account_id", ids);
  await client.from("bank_accounts").delete().in("id", ids);
}

type RealPayment = { amount: number; payment_date: string };

async function pickRealPayment(client: SupabaseClient): Promise<RealPayment | null> {
  const { data } = await client
    .from("payments")
    .select("amount,payment_date,currency")
    .eq("currency", "MXN")
    .order("payment_date", { ascending: false })
    .limit(25);
  const rows = (data ?? []) as Array<RealPayment & { currency: string }>;
  const usable = rows.find((p) => Number(p.amount) > 0);
  return usable ? { amount: Number(usable.amount), payment_date: usable.payment_date } : null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function seedBankScenario(page: Page, scope: string): Promise<BankSeedIds> {
  await page.goto("/");
  const client = await clientFromPage(page);
  await sweepOrphans(client);

  const accountName = `QA Conciliación ${scope}`;
  const { data: account, error: accErr } = await client
    .from("bank_accounts")
    .insert({
      name: accountName,
      bank: "QA Bank",
      last4: "9999",
      currency: "MXN",
      initial_balance: 0,
      is_active: true,
      notes: `${TMP_PREFIX}_${scope}`,
    })
    .select("id")
    .single();
  if (accErr || !account) throw new Error(`[e2e bankSeed] cuenta: ${accErr?.message}`);
  const accountId = (account as { id: string }).id;

  const { data: imp, error: impErr } = await client
    .from("bank_statement_imports")
    .insert({
      bank_account_id: accountId,
      file_name: `qa-${scope}.csv`,
      lines_count: 3,
      period_start: today(),
      period_end: today(),
    })
    .select("id")
    .single();
  if (impErr || !imp) throw new Error(`[e2e bankSeed] importación: ${impErr?.message}`);
  const importId = (imp as { id: string }).id;

  const real = await pickRealPayment(client);
  // Si no hay pagos reales usables, el escenario sigue siendo válido: la línea
  // simplemente no tendrá candidatos y el test de emparejamiento se salta.
  const exactAmount = real?.amount ?? 4321.55;
  const exactDate = real?.payment_date ?? today();

  const exactRef = `E2EX${scope}`.slice(0, 20);
  const orphanRef = `E2EO${scope}`.slice(0, 20);
  const chargeRef = `E2EC${scope}`.slice(0, 20);

  const rows = [
    {
      import_id: importId,
      bank_account_id: accountId,
      posted_date: exactDate,
      description: `SPEI RECIBIDO QA EXACTO ${scope}`,
      signed_amount: exactAmount,
      reference: exactRef,
      hash: `${scope}-exact`,
      status: "unmatched" as const,
    },
    {
      import_id: importId,
      bank_account_id: accountId,
      posted_date: today(),
      description: `DEPOSITO QA SIN CANDIDATOS ${scope}`,
      signed_amount: 987654.32,
      reference: orphanRef,
      hash: `${scope}-orphan`,
      status: "unmatched" as const,
    },
    {
      import_id: importId,
      bank_account_id: accountId,
      posted_date: today(),
      description: `COMISION BANCARIA QA ${scope}`,
      signed_amount: -1850.5,
      reference: chargeRef,
      hash: `${scope}-charge`,
      status: "unmatched" as const,
    },
  ];

  const { data: lines, error: lineErr } = await client
    .from("bank_statement_lines")
    .insert(rows)
    .select("id,hash");
  if (lineErr || !lines) throw new Error(`[e2e bankSeed] líneas: ${lineErr?.message}`);

  const byHash = (suffix: string): string => {
    const found = (lines as Array<{ id: string; hash: string }>).find((l) =>
      l.hash.endsWith(suffix),
    );
    if (!found) throw new Error(`[e2e bankSeed] falta línea ${suffix}`);
    return found.id;
  };

  return {
    scope,
    accountId,
    accountName,
    importId,
    exactLineId: byHash("exact"),
    exactAmount,
    exactRef,
    orphanLineId: byHash("orphan"),
    orphanRef,
    chargeLineId: byHash("charge"),
    chargeRef,
  };
}

export async function teardownBankScenario(page: Page, accountId: string): Promise<void> {
  const client = await clientFromPage(page);
  await client.from("bank_statement_lines").delete().eq("bank_account_id", accountId);
  await client.from("bank_statement_imports").delete().eq("bank_account_id", accountId);
  const { error } = await client.from("bank_accounts").delete().eq("id", accountId);
  if (error) throw new Error(`[e2e bankSeed teardown] ${error.message}`);

  // Verificación dura: nada debe sobrevivir.
  const { count } = await client
    .from("bank_statement_lines")
    .select("id", { count: "exact", head: true })
    .eq("bank_account_id", accountId);
  if ((count ?? 0) > 0) {
    throw new Error(`[e2e bankSeed teardown] quedaron ${count} líneas de la cuenta ${accountId}`);
  }
}

export const test = base.extend<{ bank: BankSeedIds }>({
  bank: async ({ page }, use, testInfo) => {
    const scope = buildScope(testInfo);
    const ids = await seedBankScenario(page, scope);
    let testError: unknown;
    try {
      await use(ids);
    } catch (e) {
      testError = e;
    }
    let teardownError: unknown;
    try {
      await teardownBankScenario(page, ids.accountId);
    } catch (err) {
      teardownError = err;
    }
    if (teardownError && !testError) throw teardownError;
    if (teardownError) {
      console.error(`[e2e] teardown bancario falló para ${ids.accountId}:`, teardownError);
    }
    if (testError) throw testError;
  },
});

export { expect } from "@playwright/test";
