import { test as base, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAuthToken } from "./helpers";

/**
 * Fixture del Kanban de CRM.
 *
 * `prospects` NO tiene columna `e2e_scope`, así que el purgado global no la
 * alcanza: este fixture borra SIEMPRE por id al terminar (pase o falle) y
 * además barre prospectos huérfanos marcados con el prefijo temporal de
 * corridas previas que murieron a medias.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "[e2e] VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY son obligatorios para crmSeed.",
  );
}

const TMP_PREFIX = "TMP_E2E_CRM";
const ORPHAN_MAX_AGE_MS = 6 * 60 * 60 * 1_000;

export type CrmSeedIds = {
  scope: string;
  prospectId: string;
  companyName: string;
  /** Etapa inicial de la tarjeta sembrada. */
  stage: string;
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

async function sweepOrphans(client: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - ORPHAN_MAX_AGE_MS).toISOString();
  await client
    .from("prospects")
    .delete()
    .like("company_name", `${TMP_PREFIX}%`)
    .lt("created_at", cutoff);
}

export async function seedCrmScenario(page: Page, scope: string): Promise<CrmSeedIds> {
  await page.goto("/");
  const client = await clientFromPage(page);
  await sweepOrphans(client);

  const companyName = `${TMP_PREFIX} ${scope}`;
  const stage = "nuevo_prospecto";
  const { data, error } = await client
    .from("prospects")
    .insert({
      company_name: companyName,
      contact_person: "QA Automatizado",
      stage,
      deal_value: 12345,
      notes: TMP_PREFIX,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`[e2e crmSeed] no se pudo crear el prospecto: ${error?.message}`);
  }

  return { scope, prospectId: String(data.id), companyName, stage };
}

export async function teardownCrmScenario(page: Page, prospectId: string): Promise<void> {
  const client = await clientFromPage(page);
  const { error } = await client.from("prospects").delete().eq("id", prospectId);
  if (error) throw new Error(`[e2e crmSeed teardown] ${error.message}`);

  const { count } = await client
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("id", prospectId);
  if ((count ?? 0) > 0) {
    throw new Error(`[e2e crmSeed teardown] el prospecto ${prospectId} sigue existiendo`);
  }
}

export const test = base.extend<{ crm: CrmSeedIds }>({
  crm: async ({ page }, use, testInfo) => {
    const ids = await seedCrmScenario(page, buildScope(testInfo));
    let testError: unknown;
    try {
      await use(ids);
    } catch (e) {
      testError = e;
    }
    let teardownError: unknown;
    try {
      await teardownCrmScenario(page, ids.prospectId);
    } catch (err) {
      teardownError = err;
    }
    if (teardownError && !testError) throw teardownError;
    if (teardownError) {
      console.error(`[e2e] teardown CRM falló para ${ids.prospectId}:`, teardownError);
    }
    if (testError) throw testError;
  },
});

export { expect } from "@playwright/test";
