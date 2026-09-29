import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  bookingResponse: { data: { forklift_id: "forklift-from-booking" }, error: null },
  forkliftResponse: {
    data: {
      manufacturer: "Toyota",
      model: "8FGU25",
      serial_number: "TST-902",
      capacity_kg: 2500,
      fuel_type: "Gas LP",
      acquisition_cost: 420000,
    },
    error: null,
  },
  bookingCalls: [] as unknown[],
  forkliftCalls: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseChainMock } = await import("@/test/helpers/supabaseChain");
  return {
    supabase: createSupabaseChainMock({
      tableResolvers: {
        bookings: (calls) => {
          mockState.bookingCalls = calls;
          return mockState.bookingResponse;
        },
        forklifts: (calls) => {
          mockState.forkliftCalls = calls;
          return mockState.forkliftResponse;
        },
      },
    }),
  };
});

vi.mock("@/lib/pdf/shared", () => ({
  fetchCompanyDataAndLogo: vi.fn(async () => ({
    company: {
      razon_social: "LiftGo",
      rfc: "LIF010101AAA",
      regimen_fiscal: "601",
      lugar_expedicion: "64000",
    },
  })),
}));

import { fetchRelatedData, type ContractData } from "../fetchers";

function contract(overrides: Record<string, unknown> = {}): ContractData {
  return {
    id: "contract-legacy",
    contract_number: "CTR-0042",
    booking_id: "booking-legacy",
    customer_id: null,
    forklift_id: null,
    status: "draft",
    signed_snapshot: null,
    ...overrides,
  } as unknown as ContractData;
}

describe("fetchRelatedData legacy booking equipment", () => {
  beforeEach(() => {
    mockState.bookingResponse = { data: { forklift_id: "forklift-from-booking" }, error: null };
    mockState.forkliftResponse = {
      data: {
        manufacturer: "Toyota",
        model: "8FGU25",
        serial_number: "TST-902",
        capacity_kg: 2500,
        fuel_type: "Gas LP",
        acquisition_cost: 420000,
      },
      error: null,
    };
    mockState.bookingCalls = [];
    mockState.forkliftCalls = [];
  });

  it("loads the booking's forklift when a legacy contract has no forklift_id", async () => {
    const result = await fetchRelatedData(contract());

    expect(result.forklift).toMatchObject({
      manufacturer: "Toyota",
      model: "8FGU25",
      serial_number: "TST-902",
    });
    expect(mockState.bookingCalls).toContainEqual({
      method: "eq",
      args: ["id", "booking-legacy"],
    });
    expect(mockState.forkliftCalls).toContainEqual({
      method: "eq",
      args: ["id", "forklift-from-booking"],
    });
  });

  it("keeps a signed snapshot's equipment without reading the live booking", async () => {
    const result = await fetchRelatedData(contract({
      status: "signed",
      signed_snapshot: {
        forklift: { manufacturer: "Toyota", model: "Congelado", serial_number: "OLD-1" },
      },
    }));

    expect(result.forklift).toMatchObject({ model: "Congelado", serial_number: "OLD-1" });
    expect(mockState.bookingCalls).toHaveLength(0);
    expect(mockState.forkliftCalls).toHaveLength(0);
  });
});
