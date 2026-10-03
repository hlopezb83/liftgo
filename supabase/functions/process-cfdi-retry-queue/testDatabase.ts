import type { OrgQueryClient } from "../_shared/orgContext.ts";

type Row = Record<string, unknown>;
type Query = {
  table: string;
  patch?: Row;
  filters: Array<(row: Row) => boolean>;
  limit?: number;
  single: boolean;
};
export const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const QUEUE_ID = "11111111-1111-4111-8111-111111111111";
export const INVOICE_ID = "22222222-2222-4222-8222-222222222222";
export const VERSION = "2026-01-01T00:00:00.000Z";

/** Modelo de filtros y RETURNING; no contiene decisiones fiscales del consumidor. */
export function testDatabase() {
  const tables: Record<string, Row[]> = {
    cfdi_retry_queue: [{
      id: QUEUE_ID,
      organization_id: ORG_A,
      updated_at: VERSION,
      operation: "stamp",
      invoice_id: INVOICE_ID,
      attempts: 2,
      max_attempts: 5,
      payload: { organization_id: ORG_B },
      status: "pending",
      deferrals: 0,
      last_error: "original failure",
      next_retry_at: VERSION,
    }],
    invoices: [{
      id: INVOICE_ID,
      organization_id: ORG_A,
      updated_at: VERSION,
      cfdi_status: "error",
      cfdi_uuid: null,
      facturapi_invoice_id: null,
    }],
    company_settings: [{ organization_id: ORG_A, facturapi_mode: "test" }],
    billing_secrets: [{
      organization_id: ORG_A,
      facturapi_test_key: "sk_test_synthetic_fixture_only",
    }],
  };
  const queries: Query[] = [];
  let tick = 0;
  let before: ((query: Query) => void) | undefined;
  let fail: ((query: Query) => boolean) | undefined;
  const run = (q: Query) => {
    queries.push(q);
    before?.(q);
    if (fail?.(q)) {
      return { data: null, error: { message: "synthetic database failure" } };
    }
    const rows = (tables[q.table] ?? []).filter((row) =>
      q.filters.every((match) => match(row))
    ).slice(0, q.limit);
    if (q.patch) {
      for (const row of rows) {
        Object.assign(row, q.patch, {
          updated_at: new Date(Date.UTC(2026, 9, 3, 12, 0, 0, ++tick))
            .toISOString(),
        });
      }
    }
    const data = rows.map((row) => ({ ...row }));
    return { data: q.single ? data[0] ?? null : data, error: null };
  };
  const admin: OrgQueryClient = {
    from: (table: string) => {
      const q: Query = { table, filters: [], single: false };
      const builder = {
        select: (_columns: string) => builder,
        update: (patch: Row) => {
          q.patch = patch;
          return builder;
        },
        eq: (key: string, value: unknown) => {
          q.filters.push((row) => row[key] === value);
          return builder;
        },
        neq: (key: string, value: unknown) => {
          q.filters.push((row) => row[key] !== value);
          return builder;
        },
        is: (key: string, value: unknown) => {
          q.filters.push((row) => row[key] === value);
          return builder;
        },
        lte: (key: string, value: string) => {
          q.filters.push((row) => String(row[key]) <= value);
          return builder;
        },
        lt: (key: string, value: string) => {
          q.filters.push((row) => String(row[key]) < value);
          return builder;
        },
        order: (_key: string, _options: unknown) => builder,
        limit: (count: number) => {
          q.limit = count;
          return builder;
        },
        maybeSingle: () => {
          q.single = true;
          return Promise.resolve(run(q));
        },
        then: (resolve: (result: ReturnType<typeof run>) => unknown) =>
          Promise.resolve(run(q)).then(resolve),
      };
      return builder;
    },
  };
  return {
    admin,
    tables,
    queries,
    beforeQuery: (hook: typeof before) => {
      before = hook;
    },
    failQuery: (hook: typeof fail) => {
      fail = hook;
    },
  };
}
