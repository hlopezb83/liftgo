import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm, useWatch } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Form } from "@/components/ui/form";
import { SupplierField } from "../SupplierField";

const state = vi.hoisted(() => ({ loading: false, failed: false, cached: true, refetch: vi.fn() }));
vi.mock("../../hooks/useSuppliers", () => ({ useSuppliers: () => ({
  isLoading: state.loading, isError: state.failed, refetch: state.refetch,
  data: state.cached ? [{ id: "supplier-a", name: "Proveedor QA" }] : undefined,
}) }));

function Harness({ allowEmpty = false, disabled = false, required = true, selected = null }: {
  allowEmpty?: boolean; disabled?: boolean; required?: boolean; selected?: string | null;
}) {
  const form = useForm<{ supplier_id: string | null }>({ defaultValues: { supplier_id: selected } });
  const value = useWatch({ control: form.control, name: "supplier_id" });
  return <Form {...form}><form>
    <SupplierField control={form.control} name="supplier_id" required={required} allowEmpty={allowEmpty} disabled={disabled} />
    <output data-testid="selected">{value ?? "null"}</output>
    <button type="button" onClick={() => form.setError("supplier_id", { type: "required", message: "Proveedor requerido" })}>Validar</button>
  </form></Form>;
}
function open() { fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" }); }

beforeEach(() => { state.loading = false; state.failed = false; state.cached = true; state.refetch.mockReset(); });
describe("connected supplier field", () => {
  it("retains loading and explicit disabled states", () => {
    state.loading = true;
    const view = render(<Harness />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    state.loading = false;
    view.rerender(<Harness disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
  it("selects a supplier and persists the empty option as null", async () => {
    render(<Harness allowEmpty />);
    open();
    fireEvent.click(await screen.findByRole("option", { name: "Proveedor QA" }));
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("supplier-a"));
    open();
    fireEvent.click(await screen.findByRole("option", { name: "Sin proveedor" }));
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("null"));
  });
  it.each([false, true])("allows clearing an optional supplier during an error (cache: %s)", (cached) => {
    state.failed = true;
    state.cached = cached;
    render(<Harness allowEmpty required={false} selected="supplier-a" />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Quitar proveedor" }));
    expect(screen.getByTestId("selected")).toHaveTextContent("null");
    expect(screen.queryByRole("button", { name: "Quitar proveedor" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar proveedores" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it.each([{ required: true }, { disabled: true, required: false }])("keeps clearing unavailable under %o", (restriction) => {
    state.failed = true;
    render(<Harness allowEmpty selected="supplier-a" {...restriction} />);
    expect(screen.queryByRole("button", { name: "Quitar proveedor" })).not.toBeInTheDocument();
    expect(screen.getByTestId("selected")).toHaveTextContent("supplier-a");
  });

  it("does not offer null when required by its caller and displays RHF errors", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Validar" }));
    expect(await screen.findByText("Proveedor requerido")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
    open();
    expect(await screen.findByRole("option", { name: "Proveedor QA" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Sin proveedor" })).not.toBeInTheDocument();
  });
});
