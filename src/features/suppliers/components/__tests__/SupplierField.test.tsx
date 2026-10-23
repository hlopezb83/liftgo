import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm, useWatch } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Form } from "@/components/ui/form";
import { SupplierField } from "../SupplierField";

const state = vi.hoisted(() => ({ loading: false }));
vi.mock("../../hooks/useSuppliers", () => ({ useSuppliers: () => ({
  isLoading: state.loading, data: [{ id: "supplier-a", name: "Proveedor QA" }],
}) }));

function Harness({ allowEmpty = false, disabled = false }: { allowEmpty?: boolean; disabled?: boolean }) {
  const form = useForm<{ supplier_id: string | null }>({ defaultValues: { supplier_id: null } });
  const value = useWatch({ control: form.control, name: "supplier_id" });
  return <Form {...form}><form>
    <SupplierField control={form.control} name="supplier_id" required allowEmpty={allowEmpty} disabled={disabled} />
    <output data-testid="selected">{value ?? "null"}</output>
    <button type="button" onClick={() => form.setError("supplier_id", { type: "required", message: "Proveedor requerido" })}>Validar</button>
  </form></Form>;
}
function open() { fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" }); }

beforeEach(() => { state.loading = false; });
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
