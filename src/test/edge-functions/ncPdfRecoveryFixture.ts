import { vi } from "vitest";

export type Row = Record<string, unknown>;
export const ORGANIZATION_A = "11111111-1111-4111-8111-111111111111";
export const ORGANIZATION_B = "22222222-2222-4222-8222-222222222222";
export const PDF_NOW = "2026-11-08T12:00:00.000Z";
export const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\nfixture\n%%EOF");

export function pdfPendingNote(overrides: Row = {}): Row {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    organization_id: ORGANIZATION_A,
    status: "stamped",
    cfdi_status: "stamped",
    cancellation_status: "none",
    cfdi_uuid: "44444444-4444-4444-8444-444444444444",
    facturapi_invoice_id: "pac-note-1",
    cfdi_xml_pending: false,
    cfdi_xml_url: `${ORGANIZATION_A}/credit-notes/note/original.xml`,
    cfdi_pdf_url: null,
    updated_at: "2026-11-08T11:00:00.000Z",
    lookup_attempts: 2,
    stamping_attempts: 3,
    stamped_at: "2026-11-08T10:59:00.000Z",
    total: 116,
    balance: 116,
    ...overrides,
  };
}

export interface QueryFilter {
  operator: "eq" | "is" | "not" | "lt";
  column: string;
  value: unknown;
  negatedOperator?: string;
}
export interface QueryRecord {
  table: string;
  columns: string;
  filters: QueryFilter[];
  order: Array<{ column: string; ascending: boolean }>;
  limit: number | undefined;
  patch?: Row;
}
export type WriteFailure = {
  stage: "claim" | "final";
  outcome: "error" | "zero" | "throw";
};
type QueryResult = { data: Row | Row[] | null; error: unknown };

// This deliberately implements query semantics, not the handler's eligibility
// predicate. A missing production filter therefore changes actual test data.
function matches(row: Row, filter: QueryFilter): boolean {
  const actual = row[filter.column];
  switch (filter.operator) {
    case "eq":
      return actual != null && filter.value != null && actual === filter.value;
    case "is":
      return actual === filter.value;
    case "not":
      if (filter.negatedOperator === "is") return actual !== filter.value;
      if (filter.negatedOperator === "eq") {
        return (
          actual != null && filter.value != null && actual !== filter.value
        );
      }
      throw new Error(`Unsupported fixture NOT ${filter.negatedOperator}`);
    case "lt":
      if (actual == null || filter.value == null) return false;
      if (filter.column.endsWith("_at")) {
        return Date.parse(String(actual)) < Date.parse(String(filter.value));
      }
      return String(actual) < String(filter.value);
  }
}

function project(row: Row, columns: string): Row {
  if (columns === "*") return { ...row };
  return Object.fromEntries(
    columns.split(",").map((column) => [column.trim(), row[column.trim()]]),
  );
}

export function createNcPdfRecoveryFixture(
  mocks: { admin: unknown },
  notes: Row[] = [pdfPendingNote()],
) {
  const tables: Record<string, Row[]> = {
    credit_notes: notes,
    invoices: [],
    payments: [],
    organization_memberships: [
      {
        auth_user_id: "manual-user",
        organization_id: ORGANIZATION_A,
        member_type: "internal",
      },
    ],
    organizations: [
      { id: ORGANIZATION_A, is_active: true },
      { id: ORGANIZATION_B, is_active: true },
    ],
  };
  const reads: QueryRecord[] = [];
  const writes: QueryRecord[] = [];
  const committed: QueryRecord[] = [];
  const behavior: {
    failure?: WriteFailure;
    beforeWrite?: (query: QueryRecord) => void;
    readError?: (query: QueryRecord) => boolean;
  } = {};
  const upload = vi.fn(
    async (
      path: string,
      _bytes: Uint8Array,
      _options: Record<string, unknown>,
    ) => ({ data: { path }, error: null as { message: string } | null }),
  );
  const storageFrom = vi.fn((_bucket: string) => ({ upload }));
  const rpc = vi.fn(() => {
    throw new Error("PDF recovery must never invoke a fiscal RPC");
  });

  // Instrumentation runs before matching filters so tests can simulate a row
  // changing after selection but before the database evaluates its UPDATE.
  function recordQueryAndCheckFailure(
    snapshot: QueryRecord,
  ): QueryResult | null {
    const patch = snapshot.patch;
    if (!patch) {
      reads.push(snapshot);
      return behavior.readError?.(snapshot)
        ? { data: null, error: { message: "Injected read failure" } }
        : null;
    }
    writes.push(snapshot);
    behavior.beforeWrite?.(snapshot);
    const stage = "cfdi_pdf_url" in patch ? "final" : "claim";
    if (behavior.failure?.stage !== stage) return null;
    const outcome = behavior.failure.outcome;
    if (outcome === "throw") throw new Error("Injected DB transport error");
    return {
      data: null,
      error: outcome === "error" ? { message: "Injected DB failure" } : null,
    };
  }

  const admin = {
    storage: { from: storageFrom },
    rpc,
    from(table: string) {
      if (!(table in tables)) throw new Error(`Unexpected table: ${table}`);
      const spec: QueryRecord = {
        table,
        columns: "*",
        filters: [],
        order: [],
        limit: undefined,
      };
      let singleton = false;
      let execution: Promise<QueryResult> | undefined;
      const execute = () => {
        execution ??= Promise.resolve().then(() => {
          const snapshot: QueryRecord = {
            ...spec,
            filters: spec.filters.map((filter) => ({ ...filter })),
            order: spec.order.map((order) => ({ ...order })),
            ...(spec.patch ? { patch: { ...spec.patch } } : {}),
          };
          const patch = snapshot.patch;
          const failure = recordQueryAndCheckFailure(snapshot);
          if (failure) return failure;
          let selected = tables[table].filter((row) =>
            snapshot.filters.every((filter) => matches(row, filter)),
          );
          for (const order of [...snapshot.order].reverse()) {
            selected = [...selected].sort((a, b) => {
              const result = String(a[order.column]).localeCompare(
                String(b[order.column]),
              );
              return order.ascending ? result : -result;
            });
          }
          if (snapshot.limit !== undefined)
            selected = selected.slice(0, snapshot.limit);
          if (patch && selected.length > 0) {
            committed.push(snapshot);
            for (const row of selected) {
              Object.assign(row, patch);
              // PostgreSQL can return six fractional digits and its trigger's
              // timestamp need not equal the JS value passed into UPDATE.
              row.updated_at = `${new Date().toISOString().slice(0, -1)}${String(committed.length).padStart(3, "0")}Z`;
            }
          }
          const data = selected.map((row) => project(row, snapshot.columns));
          return {
            data: singleton ? (data[0] ?? null) : data,
            error:
              singleton && data.length > 1
                ? { message: "Multiple rows" }
                : null,
          };
        });
        return execution;
      };
      const query = {
        select(columns = "*") {
          spec.columns = columns;
          return query;
        },
        update(patch: Row) {
          spec.patch = patch;
          return query;
        },
        eq(column: string, value: unknown) {
          spec.filters.push({ operator: "eq", column, value });
          return query;
        },
        is(column: string, value: unknown) {
          spec.filters.push({ operator: "is", column, value });
          return query;
        },
        not(column: string, operator: string, value: unknown) {
          spec.filters.push({
            operator: "not",
            column,
            value,
            negatedOperator: operator,
          });
          return query;
        },
        lt(column: string, value: unknown) {
          spec.filters.push({ operator: "lt", column, value });
          return query;
        },
        order(column: string, options: { ascending?: boolean } = {}) {
          spec.order.push({ column, ascending: options.ascending !== false });
          return query;
        },
        limit(limit: number) {
          spec.limit = limit;
          return query;
        },
        maybeSingle() {
          singleton = true;
          return execute();
        },
        single() {
          singleton = true;
          return execute();
        },
        then: (
          resolve: (result: unknown) => unknown,
          reject: (reason: unknown) => unknown,
        ) => execute().then(resolve, reject),
      };
      return query;
    },
  };
  mocks.admin = admin;
  return {
    admin,
    notes,
    tables,
    reads,
    writes,
    committed,
    behavior,
    upload,
    storageFrom,
    rpc,
  };
}
