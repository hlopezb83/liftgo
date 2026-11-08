import { vi } from "vitest";

type Write = Record<string, unknown>;
type Failure =
  "ids" | "stamped" | "xml" | "state" | "counter" | "claim" | "throw" | "none";

// Keep failure selection independent from query evaluation and CAS matching.
const failurePredicates: Record<Failure, (patch: Write) => boolean> = {
  claim: (patch) => Object.keys(patch).length === 1 && "updated_at" in patch,
  state: (patch) => "cfdi_status" in patch || "facturapi_invoice_id" in patch,
  counter: (patch) => "lookup_attempts" in patch,
  ids: (patch) => "facturapi_invoice_id" in patch && !("cfdi_status" in patch),
  stamped: (patch) => patch.cfdi_status === "stamped",
  xml: (patch) => "stamping_attempts" in patch,
  throw: () => false,
  none: () => false,
};
export function createNcPersistenceFixture(
  mocks: { admin: unknown },
  fail: Failure,
  noRow = false,
  attempts = 0,
  existingIds = false,
) {
  const note: Write = {
    id: "note-1",
    organization_id: "11111111-1111-4111-8111-111111111111",
    cfdi_status: "stamping",
    cfdi_uuid: existingIds ? "22222222-2222-4222-8222-222222222222" : null,
    facturapi_invoice_id: existingIds ? "pac-1" : null,
    updated_at: "2026-01-01T00:00:00.000Z",
    lookup_attempts: 2,
    stamping_attempts: attempts,
  };
  const writes: Write[] = [];
  const writeFilters: Write[] = [];
  const upload = vi.fn(async () => ({ error: null }));
  mocks.admin = {
    storage: { from: () => ({ upload }) },
    from(table: string) {
      let patch: Write | undefined;
      const filters: Record<string, unknown> = {};
      const result = () => {
        if (!patch)
          return {
            data:
              table === "credit_notes" && filters.cfdi_status === "stamping"
                ? [{ ...note }]
                : [],
            error: null,
          };
        writes.push({ ...patch });
        writeFilters.push({ ...filters });
        if (Object.entries(filters).some(([key, value]) => note[key] !== value))
          return { data: null, error: null };
        if (fail === "throw" && "facturapi_invoice_id" in patch)
          throw new Error("injected transport failure");
        const fails = failurePredicates[fail](patch);
        if (fails)
          return {
            data: null,
            error: noRow ? null : { message: "injected persistence failure" },
          };
        Object.assign(note, patch);
        note.updated_at = `2026-11-06T10:00:${String(writes.length).padStart(2, "0")}.123456Z`;
        return {
          data: { id: note.id, updated_at: note.updated_at },
          error: null,
        };
      };
      const query = {
        select: () => query,
        update: (value: Write) => {
          patch = value;
          return query;
        },
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        lt: () => query,
        order: () => query,
        limit: () => query,
        is: () => query,
        not: () => query,
        maybeSingle: () => Promise.resolve(result()),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
  return { note, writes, writeFilters, upload };
}
