import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useCorrectDeliveryDate } from "../useDeliveries";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

beforeEach(() => { state.rpc.mockReset(); });

// Mirror only the existing server time guard; the hook builds the real payload.
function acceptThrough(serverNow: string) {
  state.rpc.mockImplementation(async (_name: string, args: { p_completed_at: string }) => ({
    data: "delivery-1",
    error: new Date(args.p_completed_at) > new Date(serverNow)
      ? new Error("La fecha real no puede ser futura") : null,
  }));
}

describe("Corrección de fecha de entrega", () => {
  it.each(["00:05:00", "09:00:00", "15:00:00", "23:59:00"])(
    "acepta hoy a las %s de Monterrey sin cambiar el día elegido", async time => {
      acceptThrough(`2026-11-13T${time}-06:00`);
      const { Wrapper } = createQueryWrapper();
      const { result } = renderHook(() => useCorrectDeliveryDate(), { wrapper: Wrapper });
      await act(async () => {
        await expect(result.current.mutateAsync({ id: "delivery-1", date: "2026-11-13", reason: "Fecha incorrecta" })).resolves.toBe("delivery-1");
      });
      const [name, args] = state.rpc.mock.calls[0];
      expect(name).toBe("correct_delivery_completed_at");
      expect(args).toMatchObject({ p_delivery_id: "delivery-1", p_reason: "Fecha incorrecta" });
      const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date(args.p_completed_at));
      expect(localDay).toBe("2026-11-13");
    },
  );

  it("conserva el rechazo del servidor para mañana", async () => {
    acceptThrough("2026-11-13T23:59:00-06:00");
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCorrectDeliveryDate(), { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: "delivery-1", date: "2026-11-14", reason: "Fecha incorrecta" })).rejects.toThrow("futura");
    });
  });
});
