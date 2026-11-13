import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseDeliveriesPage, type DeliveriesPageRpcArgs } from "./deliveriesPageRpc";
import { parseOverdueDeliveriesPage } from "./overdueDeliveriesPageRpc";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

// Synthetic MD5 IDs reproduce PostgreSQL's canonical UUID output, including
// version/variant bit patterns that are valid in uuid columns but not RFC UUIDs.
function historicalId(seed: string) {
  return createHash("md5").update(`synthetic-delivery-compat-${seed}`).digest("hex")
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}
const row = {
  id: historicalId("delivery"), organization_id: historicalId("organization"),
  booking_id: historicalId("booking"), forklift_id: historicalId("forklift"),
  delivery_number: "QA-HISTORICAL-001", type: "delivery", status: "scheduled",
  scheduled_date: "2026-11-09", scheduled_time: null, address: null, driver_name: null,
  forklifts: { name: "QA Equipo", model: null }, historical_reconciliation: null,
};
const args: DeliveriesPageRpcArgs = {
  p_expected_organization_id: row.organization_id, p_search: null, p_type: "all", p_status: "all",
  p_history: "all", p_page: 0, p_page_size: 25, p_sort: [],
};
const page = { items: [row], totalCount: 1, overdueCount: 1, pageIndex: 0, today: "2026-11-10" };
const ledger = {
  delivery_id: row.id, organization_id: row.organization_id, classification: "closed_rental",
  reference_date: "2026-11-09", date_basis: "booking_start_authorized", evidence: {},
  reason: "Synthetic historical reconciliation", authorization_source: "Local fixture",
  reconciled_at: "2026-11-10T12:00:00.123456+00:00", revoked_at: null, revocation_reason: null,
};

describe.each([
  ["general", parseDeliveriesPage],
  ["overdue", parseOverdueDeliveriesPage],
] as const)("%s PostgreSQL UUID compatibility", (_name, parse) => {
  it("accepts historical hash-derived IDs in every row identifier without changing them", () => {
    expect(parse(page, args).items[0]).toMatchObject({
      id: row.id, organization_id: row.organization_id, booking_id: row.booking_id, forklift_id: row.forklift_id,
    });
  });

  it.each(["id", "organization_id", "booking_id", "forklift_id"])("rejects a malformed %s", (field) => {
    expect(() => parse({ ...page, items: [{ ...row, [field]: "not-a-uuid" }] }, args)).toThrow();
  });

  it.each([123, null, "", "12345678-1234-abcd-1234-1234567890xy", "123456781234abcd12341234567890ab"])("rejects a noncanonical ID value %s", (id) => {
    expect(() => parse({ ...page, items: [{ ...row, id }] }, args)).toThrow();
  });

  it("retains tenant, distinct-row and pagination checks for historical UUIDs", () => {
    expect(() => parse(page, { ...args, p_expected_organization_id: historicalId("other-org") })).toThrow();
    expect(() => parse({ ...page, items: [row, row], totalCount: 2 }, args)).toThrow();
    expect(() => parse({ ...page, totalCount: 2 }, args)).toThrow();
  });
});

it("accepts historical UUIDs in the reconciliation and still enforces its delivery and tenant links", () => {
  const reconciled = { ...page, items: [{ ...row, historical_reconciliation: ledger }] };
  const historyArgs = { ...args, p_history: "reconciled" };
  expect(parseDeliveriesPage(reconciled, historyArgs).items[0].historical_reconciliation).toEqual(ledger);
  expect(() => parseDeliveriesPage(reconciled, args)).toThrow();
  for (const field of ["delivery_id", "organization_id"]) {
    for (const value of ["not-a-uuid", historicalId("other-link")]) {
      expect(() => parseDeliveriesPage({ ...page, items: [{ ...row, historical_reconciliation: { ...ledger, [field]: value } }] }, historyArgs)).toThrow();
    }
  }
});
