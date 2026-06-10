/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures receive a `use` callback that the rule mistakes for a React Hook. */
import { test as base, type Page, type TestInfo } from "@playwright/test";
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
  scope: string;
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://zxefrzfaynnfwazqhwxp.supabase.co";
const PUBLISHABLE_FALLBACK =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4ZWZyemZheW5uZndhenFod3hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTg3MzksImV4cCI6MjA4NjQzNDczOX0.CWTcUqTDNQ-YBU1ZzjdyFl3RblobAdfL2YbVN2XPwY8";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  PUBLISHABLE_FALLBACK;

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

/**
 * Build a unique scope per test so parallel workers / sharded CI jobs do not
 * collide. Format: `w{workerIdx}-{testId8}-{rand4}`. Stored on every seeded
 * row's `e2e_scope` column; teardown deletes only rows matching this tag.
 */
function buildScope(testInfo: TestInfo): string {
  const worker = testInfo.workerIndex ?? 0;
  const testId = testInfo.testId.slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6);
  return `w${worker}-${testId}-${rand}`;
}

export async function seedScenario(page: Page, scope: string): Promise<SeedIds> {
  await page.goto("/");
  const client = await clientFromPage(page);
  const { data, error } = await client.rpc("e2e_seed_scenario", { p_scope: scope });
  if (error) throw new Error(`e2e_seed_scenario failed: ${error.message}`);
  return data as SeedIds;
}

export async function teardownScenario(page: Page, scope: string): Promise<void> {
  try {
    const client = await clientFromPage(page);
    const { error } = await client.rpc("e2e_teardown", { p_scope: scope });
    if (error) console.warn(`[e2e_teardown] ${error.message}`);
  } catch (err) {
    console.warn("[e2e_teardown] skipped:", err instanceof Error ? err.message : err);
  }
}

/**
 * Playwright fixture that injects a scoped, parallel-safe seeded scenario
 * and cleans it up after.
 *
 * Usage:
 *   import { test } from "./fixtures/seed";
 *   test("...", async ({ page, seed }) => { ... seed.invoice_id ... });
 */
export const test = base.extend<{ seed: SeedIds }>({
  seed: async ({ page }, use, testInfo) => {
    const scope = buildScope(testInfo);
    const ids = await seedScenario(page, scope);
    await use(ids);
    await teardownScenario(page, scope);
  },
});

export { expect } from "@playwright/test";
