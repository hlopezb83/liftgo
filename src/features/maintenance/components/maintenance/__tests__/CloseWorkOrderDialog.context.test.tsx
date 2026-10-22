import { useEffect, useState } from "react";
import { it, expect, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { TestRouter } from "@/test/router";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { CloseWorkOrderDialog } from "@/features/maintenance/components/maintenance/CloseWorkOrderDialog";
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/features/maintenance/hooks/maintenance/useWorkOrderClose", () => ({
  useCloseWorkOrder: () => ({ mutate, isPending: false }),
  useOpenDamageForLog: () => ({ data: null }),
}));
vi.mock(
  "@/features/maintenance/components/maintenance/WorkOrderCloseSummary",
  () => ({ WorkOrderCloseSummary: () => null }),
);
it("clears canceled notes before closing another work order", async () => {
  const { queryClient } = createQueryWrapper();
  const a = {
    id: "ot-a",
    service_type: "Mantenimiento",
    forklift_name: "Equipo A",
    description: "Original A",
    manual_cost: 0,
  } as NonNullable<Parameters<typeof CloseWorkOrderDialog>[0]["log"]>;
  const b = {
    ...a,
    id: "ot-b",
    forklift_name: "Equipo B",
    description: "Original B",
  };
  const onOpenChange = vi.fn();
  let setProps: (props: { open: boolean; log: typeof a | null }) => void;
  function Harness() {
    const [props, set] = useState<{ open: boolean; log: typeof a | null }>({
      open: true,
      log: a,
    });
    useEffect(() => {
      setProps = set;
    }, []);
    return <CloseWorkOrderDialog {...props} onOpenChange={onOpenChange} />;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <TestRouter>
        <Harness />
      </TestRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Notas de cierre"), {
    target: { value: "Reparación únicamente del equipo A" },
  });
  act(() =>
    setProps({ open: true, log: { ...a, description: "Refreshed A" } }),
  );
  expect(screen.getByLabelText("Notas de cierre")).toHaveValue(
    "Reparación únicamente del equipo A",
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  act(() => setProps({ open: false, log: null }));
  act(() => setProps({ open: true, log: b }));
  expect(await screen.findByLabelText("Notas de cierre")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Cerrar OT" }));
  await waitFor(() => expect(mutate).toHaveBeenCalled());
  expect(mutate.mock.calls[0][0]).toMatchObject({
    id: "ot-b",
    description: null,
  });
  // Countercheck: a successful submission also leaves a fresh next session.
  act(() => mutate.mock.calls[0][1].onSuccess());
  act(() => setProps({ open: false, log: null }));
  act(() => setProps({ open: true, log: a }));
  expect(await screen.findByLabelText("Notas de cierre")).toHaveValue("");
});
