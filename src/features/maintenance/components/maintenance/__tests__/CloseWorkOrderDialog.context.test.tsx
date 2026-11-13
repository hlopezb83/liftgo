import { useEffect, useState } from "react";
import { beforeEach, it, expect, vi } from "vitest";
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
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/utils")>(),
  nowMty: () => new Date(2026, 10, 13, 12),
}));
beforeEach(() => vi.clearAllMocks());

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
  const onCancel = vi.fn();
  let setProps: (props: { open: boolean; log: typeof a | null }) => void;
  function Harness() {
    const [props, set] = useState<{ open: boolean; log: typeof a | null }>({
      open: true,
      log: a,
    });
    useEffect(() => {
      setProps = set;
    }, []);
    return <CloseWorkOrderDialog {...props} onOpenChange={onOpenChange} onCancel={onCancel} />;
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
  expect(await screen.findByText("¿Descartar cambios?")).toBeInTheDocument();
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
  expect(screen.getByLabelText("Notas de cierre")).toHaveValue(
    "Reparación únicamente del equipo A",
  );
  expect(onCancel).not.toHaveBeenCalled();
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(mutate).not.toHaveBeenCalled();
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

function renderCloseDialog() {
  const { Wrapper } = createQueryWrapper();
  const onOpenChange = vi.fn();
  const onCancel = vi.fn();
  const onClosed = vi.fn();
  const log = {
    id: "ot-date", service_type: "Mantenimiento", forklift_name: "Equipo",
    description: "Original", manual_cost: 0,
  } as NonNullable<Parameters<typeof CloseWorkOrderDialog>[0]["log"]>;
  render(
    <TestRouter>
      <CloseWorkOrderDialog open log={log} onOpenChange={onOpenChange} onCancel={onCancel} onClosed={onClosed} />
    </TestRouter>,
    { wrapper: Wrapper },
  );
  return { onOpenChange, onCancel, onClosed };
}

it("protects a changed date without notes and submits it after continuing to edit", async () => {
  const { onOpenChange, onCancel, onClosed } = renderCloseDialog();
  const date = await screen.findByRole("textbox", { name: "Fecha de cierre" });
  fireEvent.change(date, { target: { value: "12/11/2026" } });
  fireEvent.blur(date);
  expect(date).toHaveValue("12/11/2026");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(await screen.findByText("¿Descartar cambios?")).toBeInTheDocument();
  expect(onCancel).not.toHaveBeenCalled();
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
  expect(screen.getByRole("textbox", { name: "Fecha de cierre" })).toHaveValue("12/11/2026");
  expect(screen.getByLabelText("Notas de cierre")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Cerrar OT" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0][0]).toEqual({ id: "ot-date", performedAt: "2026-11-12", description: null });
  act(() => mutate.mock.calls[0][1].onSuccess());
  expect(onOpenChange).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(onClosed).toHaveBeenCalledOnce();
  expect(onCancel).not.toHaveBeenCalled();
  expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();
});

it("cancels an unchanged session directly without asking to discard", async () => {
  const { onOpenChange, onCancel } = renderCloseDialog();
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();
  expect(mutate).not.toHaveBeenCalled();
});
