import { vi } from "vitest";

type Write = Record<string, unknown>;
type Failure = "ids" | "stamped" | "xml" | "state" | "counter" | "claim" | "throw" | "none";

// Keep failure selection independent from query evaluation and CAS matching.
const failurePredicates: Record<Failure, (patch: Write) => boolean> = {
  claim: (patch) => Object.keys(patch).length === 1 && "rep_stamping_started_at" in patch,
  state: (patch) => "rep_cfdi_status" in patch || "rep_facturapi_id" in patch,
  counter: (patch) => "rep_lookup_attempts" in patch,
  ids: (patch) => "rep_facturapi_id" in patch && !("rep_cfdi_status" in patch),
  stamped: (patch) => patch.rep_cfdi_status === "stamped",
  xml: (patch) => "rep_stamping_attempts" in patch,
  throw: () => false,
  none: () => false,
};
export function createRepPersistenceFixture(
  mocks: { admin: unknown },
  fail: Failure,
  noRow = false,
  attempts = 0,
  existingIds = false,
) {
  const payment: Write = {
    id: "payment-1",
    organization_id: "11111111-1111-4111-8111-111111111111",
    invoice_id: "invoice-1",
    rep_cfdi_status: "stamping",
    rep_cfdi_uuid: existingIds ? "22222222-2222-4222-8222-222222222222" : null,
    rep_facturapi_id: existingIds ? "pac-1" : null,
    rep_stamping_started_at: "2026-01-01T00:00:00.000Z",
    rep_lookup_attempts: 2,
    rep_stamping_attempts: attempts,
    rep_number: fail === "none" ? "REP-1" : null,
    rep_folio: 1,
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
              table === "payments" && filters.rep_cfdi_status === "stamping"
                ? [{ ...payment }]
                : [],
            error: null,
          };
        writes.push({ ...patch });
        writeFilters.push({ ...filters });
        if (Object.entries(filters).some(([key, value]) => payment[key] !== value))
          return { data: null, error: null };
        if (fail === "throw" && "rep_facturapi_id" in patch)
          throw new Error("injected transport failure");
        const fails = failurePredicates[fail](patch);
        if (fails)
          return {
            data: null,
            error: noRow ? null : { message: "injected persistence failure" },
          };
        Object.assign(payment, patch);
        return { data: { id: payment.id }, error: null };
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
  return { payment, writes, writeFilters, upload };
}
