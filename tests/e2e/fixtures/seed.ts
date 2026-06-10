import { test as base, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SeedIds = {
  model_id: string;
  forklift_id: string;
  customer_id: string;
  quote_id: string;
  quote_number: string;
  booking_id: string;
  booking_number: string;
  invoice_id: string;
  invoice_number: string;
  total: number;
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://zxefrzfaynnfwazqhwxp.supabase.co";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";

/**
 * Build a Supabase client authenticated with the JWT persisted by the auth
 * storageState fixture. We read `sb-<ref>-auth-token` from localStorage and
 * inject it as the access token on a fresh client (no second login round-trip).
 */
async function clientFromPage(page: Page): Promise<SupabaseClient> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
          return parsed?.access_token ?? null;
        } catch {
          return null;
        }
      }
    }
    return null;
  });

  if (!token) {
    throw new Error("No Supabase auth token found in localStorage. Did global.setup run?");
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function seedScenario(page: Page): Promise<SeedIds> {
  // Make sure we have an authenticated session loaded in this context.
  await page.goto("/");
  const client = await clientFromPage(page);
  const { data, error } = await client.rpc("e2e_seed_scenario");
  if (error) throw new Error(`e2e_seed_scenario failed: ${error.message}`);
  return data as SeedIds;
}

export async function teardownScenario(page: Page): Promise<void> {
  try {
    const client = await clientFromPage(page);
    const { error } = await client.rpc("e2e_teardown");
    if (error) console.warn(`[e2e_teardown] ${error.message}`);
  } catch (err) {
    console.warn("[e2e_teardown] skipped:", err instanceof Error ? err.message : err);
  }
}

/**
 * Playwright fixture that injects a seeded scenario and cleans it up after.
 *
 * Usage:
 *   import { test } from "./fixtures/seed";
 *   test("...", async ({ page, seed }) => { ... seed.invoice_id ... });
 */
export const test = base.extend<{ seed: SeedIds }>({
  seed: async ({ page }, use) => {
    const ids = await seedScenario(page);
    await use(ids);
    await teardownScenario(page);
  },
});

export { expect } from "@playwright/test";
