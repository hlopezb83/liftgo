import { randomUUID } from "node:crypto";
import { test as base, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAuthToken } from "./helpers";
import { assertNonProductionBackend } from "./productionGuard";

/**
 * Conciliación con cuenta, pago y factura propios. Limpieza por ID y scope.
 * Los registros bancarios no tienen e2e_scope; se borran explícitamente.
 */

assertNonProductionBackend("bank fixture");

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
  paymentId: string;
  accountId: string;
  accountName: string;
  importId: string;
  /** Línea con candidato de monto exacto (abono contra el pago propio del escenario). */
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

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date());
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

  const exactAmount = 4321.55;
  const exactDate = today();
  const exactRef = `E2EX${scope}`.slice(0, 20);
  const orphanRef = `E2EO${scope}`.slice(0, 20);
  const chargeRef = `E2EC${scope}`.slice(0, 20);

  const rows = [
    {
      posted_date: exactDate,
      description: `SPEI RECIBIDO QA EXACTO ${scope}`,
      signed_amount: exactAmount,
      reference: exactRef,
      line_seq: 1,
    },
    {
      posted_date: today(),
      description: `DEPOSITO QA SIN CANDIDATOS ${scope}`,
      signed_amount: 987654.32,
      reference: orphanRef,
      line_seq: 2,
    },
    {
      posted_date: today(),
      description: `COMISION BANCARIA QA ${scope}`,
      signed_amount: -1850.5,
      reference: chargeRef,
      line_seq: 3,
    },
  ];

  // La importación real escribe mediante RPC; INSERT directo está revocado.
  // Se importa antes del pago para empezar con tres movimientos pendientes.
  const uploadId = randomUUID();
  const begun = await client.rpc("begin_bank_statement_upload", {
    p_upload_id: uploadId, p_bank_account_id: accountId, p_file_name: `qa-${scope}.csv`,
    p_period_start: exactDate, p_period_end: exactDate, p_expected_count: rows.length,
  });
  if (begun.error) throw new Error("[bankSeed] iniciar carga: " + begun.error.message);
  const staged = await client.rpc("stage_bank_statement_chunk", {
    p_upload_id: uploadId, p_chunk_index: 0, p_lines: rows,
  });
  if (staged.error) throw new Error("[bankSeed] preparar carga: " + staged.error.message);
  const finalized = await client.rpc("finalize_bank_statement_upload", { p_upload_id: uploadId });
  const imported = finalized.data?.[0];
  if (finalized.error || !imported?.import_id || imported.inserted_count !== 3) {
    throw new Error("[bankSeed] finalizar carga: " + (finalized.error?.message ?? "resultado incompleto"));
  }
  const importId = imported.import_id as string;
  const { data: lines, error: lineErr } = await client.from("bank_statement_lines")
    .select("id,reference,status").eq("import_id", importId);
  if (lineErr || !lines || lines.length !== 3 || lines.some((line) => line.status !== "unmatched")) {
    throw new Error("[bankSeed] las tres líneas propias deben iniciar pendientes: " + lineErr?.message);
  }
  const byRef = (reference: string): string => {
    const found = lines.find((line) => line.reference === reference);
    if (!found) throw new Error("[bankSeed] falta línea " + reference);
    return found.id as string;
  };
  const scenario = await client.rpc("e2e_seed_scenario", { p_scope: scope });
  if (scenario.error) throw new Error("[bankSeed] escenario propio: " + scenario.error.message);
  const payment = await client.from("payments").insert({
    invoice_id: scenario.data.invoice_id, amount: exactAmount, currency: "MXN",
    exchange_rate: 1, payment_date: exactDate, payment_method: "transfer",
  }).select("id").single();
  if (payment.error || !payment.data) throw new Error("[bankSeed] pago propio: " + payment.error?.message);
  const paymentId = payment.data.id as string;

  return {
    scope,
    paymentId,
    accountId,
    accountName,
    importId,
    exactLineId: byRef(exactRef),
    exactAmount,
    exactRef,
    orphanLineId: byRef(orphanRef),
    orphanRef,
    chargeLineId: byRef(chargeRef),
    chargeRef,
  };
}

export async function teardownBankScenario(page: Page, accountId: string, scope: string): Promise<void> {
  const client = await clientFromPage(page);
  for (const table of ["bank_statement_lines", "bank_statement_imports"]) {
    const removed = await client.from(table).delete().eq("bank_account_id", accountId);
    if (removed.error) throw new Error("[bankSeed] limpiar " + table + ": " + removed.error.message);
  }
  const { error } = await client.from("bank_accounts").delete().eq("id", accountId);
  if (error) throw new Error(`[e2e bankSeed teardown] ${error.message}`);

  // Verificación dura: nada debe sobrevivir.
  const { count, error: countError } = await client
    .from("bank_statement_lines")
    .select("id", { count: "exact", head: true })
    .eq("bank_account_id", accountId);
  const cleanup = await client.rpc("e2e_teardown", { p_scope: scope });
  if (cleanup.error) throw new Error("[bankSeed] limpieza del escenario: " + cleanup.error.message);
  if (countError || count === null) throw new Error("[bankSeed] no se pudo verificar la limpieza: " + countError?.message);
  if (count > 0) {
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
      await teardownBankScenario(page, ids.accountId, ids.scope);
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
