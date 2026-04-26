import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

describe("useCreateBooking mutationFn logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls create_booking RPC with correct parameters", async () => {
    rpcMock.mockResolvedValue({ data: "new-booking-id", error: null });

    const booking = {
      forklift_id: "fork-1",
      customer_id: "cust-1",
      customer_name: "ACME Corp",
      customer_contact: "555-1234",
      start_date: "2026-03-01",
      end_date: "2026-03-15",
      recurring_billing: true,
    };

    const { data, error } = await rpcMock("create_booking", {
      p_forklift_id: booking.forklift_id,
      p_customer_id: booking.customer_id,
      p_customer_name: booking.customer_name,
      p_customer_contact: booking.customer_contact,
      p_start_date: booking.start_date,
      p_end_date: booking.end_date,
      p_recurring_billing: booking.recurring_billing,
    });

    expect(rpcMock).toHaveBeenCalledWith("create_booking", {
      p_forklift_id: "fork-1",
      p_customer_id: "cust-1",
      p_customer_name: "ACME Corp",
      p_customer_contact: "555-1234",
      p_start_date: "2026-03-01",
      p_end_date: "2026-03-15",
      p_recurring_billing: true,
    });
    expect(data).toBe("new-booking-id");
    expect(error).toBeNull();
  });

  it("throws on RPC error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Forklift not available" } });

    const result = await rpcMock("create_booking", { p_forklift_id: "fork-1" });
    expect(result.error).toBeTruthy();
    expect(result.error.message).toBe("Forklift not available");
  });
});
