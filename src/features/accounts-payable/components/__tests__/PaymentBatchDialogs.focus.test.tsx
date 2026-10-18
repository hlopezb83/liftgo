import { useRef } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import { useToggleDialog } from "@/hooks/useDialogState";
import { AccountsPayableActions } from "../AccountsPayableActions";
import { PaymentBatchDialogs, restorePaymentActionsFocus } from "../PaymentBatchDialogs";

const { state, cancel, download, create } = vi.hoisted(() => ({
  state: { busy: false }, cancel: vi.fn(), download: vi.fn(), create: vi.fn(),
}));
// Sólo datos/permisos y mutaciones: menú, diálogos, formulario y selección son reales.
vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: "admin" }),
  useRolePermissions: () => ({ data: [] }), getAccessLevel: () => "full",
}));
vi.mock("../../hooks/usePaymentBatches", () => ({
  PAYMENT_BATCH_PAGE_SIZE: 20,
  usePaymentBatches: () => ({ data: { items: [], total_count: 0 }, isPending: false, isFetching: false, isError: false }),
}));
vi.mock("../../hooks/useCancelPaymentBatch", () => ({
  useCancelPaymentBatch: () => ({ mutate: cancel, isPending: state.busy }),
}));
vi.mock("../../hooks/useDownloadPaymentBatch", () => ({
  useDownloadPaymentBatch: () => ({ mutate: download, mutateAsync: download, isPending: false }),
}));
vi.mock("../../hooks/useCreatePaymentBatch", () => ({
  useCreatePaymentBatch: () => ({ mutateAsync: create, isPending: false }),
}));
vi.mock("../../hooks/useExportablePayables", () => ({
  useExportablePayables: () => ({ data: [], isPending: false, isFetching: false, isError: false }),
}));

function Harness({ header = "desktop", showTarget = true }: { header?: string; showTarget?: boolean }) {
  const targetRef = useRef<HTMLButtonElement>(null);
  const exportDialog = useToggleDialog();
  const batchesDialog = useToggleDialog();
  return <>
    {showTarget && <AccountsPayableActions key={header} moreActionsRef={targetRef}
      releasableLocks={0} isReleasing={false} canManageBatches
      onCreate={() => {}} onRelease={() => {}} onExport={exportDialog.openDialog} onBatches={batchesDialog.openDialog} />}
    <PaymentBatchDialogs canManage exportDialog={exportDialog} batchesDialog={batchesDialog}
      onCloseAutoFocus={(event) => restorePaymentActionsFocus(event, targetRef.current)} />
  </>;
}

function setup() {
  const view = render(<TestRouter><Harness /></TestRouter>);
  // happy-dom no tiene layout; se simula sólo la geometría del destino persistente.
  const markVisible = () => {
    const target = screen.getByRole("button", { name: "Más acciones", hidden: true });
    vi.spyOn(target, "getClientRects").mockReturnValue([new DOMRect(0, 0, 120, 40)] as unknown as DOMRectList);
    return target;
  };
  const target = markVisible();
  const update = (props: Parameters<typeof Harness>[0] = {}) => {
    view.rerender(<TestRouter><Harness {...props} /></TestRouter>);
    return props.showTarget === false ? null : markVisible();
  };
  return { target, update };
}

async function openMenu(target: HTMLElement) {
  target.focus();
  fireEvent.keyDown(target, { key: "ArrowDown" });
  await screen.findByRole("menu");
}

async function openDialog(target: HTMLElement, itemName = "Historial de lotes", title = "Historial de lotes de pago") {
  await openMenu(target);
  const item = screen.getByRole("menuitem", { name: itemName });
  item.focus();
  fireEvent.keyDown(item, { key: "Enter" });
  const dialog = await screen.findByRole("dialog", { name: title });
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  return dialog;
}

function escape() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

async function expectRestored(target: HTMLElement) {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(target).toHaveFocus());
}

beforeEach(() => {
  state.busy = false;
  vi.clearAllMocks();
});

describe("V02 · foco de acciones y diálogos reales", () => {
  it.each(["Escape", "footer", "X"])("Historial cerrado con %s devuelve foco tras desmontar", async (method) => {
    const { target } = setup();
    const focus = vi.spyOn(target, "focus");
    const dialog = await openDialog(target);
    focus.mockClear();
    if (method === "Escape") escape();
    else {
      const buttons = within(dialog).getAllByRole("button", { name: "Cerrar" });
      fireEvent.click(method === "footer" ? buttons[0] : buttons[1]);
    }
    await expectRestored(target);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(cancel).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("conserva foco en ciclos repetidos de apertura y cierre", async () => {
    const { target } = setup();
    for (let cycle = 0; cycle < 3; cycle++) {
      await openDialog(target);
      escape();
      await expectRestored(target);
    }
  });

  it("resuelve el ref actual al remontar el encabezado desktop/móvil", async () => {
    const { target, update } = setup();
    await openDialog(target);
    const mobile = update({ header: "mobile" });
    expect(target.isConnected).toBe(false);
    expect(mobile).not.toBeNull();
    escape();
    if (!mobile) throw new Error("Falta destino móvil");
    await expectRestored(mobile);
    await openDialog(mobile);
    const desktop = update({ header: "desktop" });
    escape();
    if (!desktop) throw new Error("Falta destino desktop");
    await expectRestored(desktop);
  });

  it("sin destino conectado cierra sin intentar enfocar el botón desmontado", async () => {
    const { target, update } = setup();
    await openDialog(target);
    update({ showTarget: false });
    const focus = vi.spyOn(target, "focus");
    escape();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(focus).not.toHaveBeenCalled();
  });

  it("isBusy bloquea Escape, Cerrar y X sin restauración prematura", async () => {
    const { target, update } = setup();
    const dialog = await openDialog(target);
    state.busy = true;
    update();
    escape();
    const buttons = within(dialog).getAllByRole("button", { name: "Cerrar" });
    expect(buttons[0]).toBeDisabled();
    fireEvent.click(buttons[1]);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog.contains(document.activeElement)).toBe(true);
    state.busy = false;
    update();
    escape();
    await expectRestored(target);
  });

  it.each(["Cancelar", "Escape"])("Exportar cerrado con %s no ejecuta operaciones y restaura foco", async (method) => {
    const { target } = setup();
    const dialog = await openDialog(target, "Exportar pagos", "Exportar pagos a Excel");
    if (method === "Escape") escape();
    else fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await expectRestored(target);
    expect(create).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("Escape en el menú sin selección mantiene el foco predeterminado", async () => {
    const { target } = setup();
    await openMenu(target);
    escape();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(target).toHaveFocus());
  });

  it.each(["ausente", "desconectado", "disabled", "aria-disabled", "sin layout", "oculto"])(
    "preserva el evento predeterminado para destino %s", (kind) => {
      const target = document.createElement("button");
      document.body.append(target);
      vi.spyOn(target, "getClientRects").mockReturnValue([new DOMRect(0, 0, 120, 40)] as unknown as DOMRectList);
      if (kind === "desconectado") target.remove();
      if (kind === "disabled") target.disabled = true;
      if (kind === "aria-disabled") target.setAttribute("aria-disabled", "true");
      if (kind === "sin layout") vi.mocked(target.getClientRects).mockReturnValue([] as unknown as DOMRectList);
      if (kind === "oculto") target.style.visibility = "hidden";
      const focus = vi.spyOn(target, "focus");
      const event = new Event("closeAutoFocus", { cancelable: true });
      restorePaymentActionsFocus(event, kind === "ausente" ? null : target);
      expect(event.defaultPrevented).toBe(false);
      expect(focus).not.toHaveBeenCalled();
      target.remove();
    },
  );
});