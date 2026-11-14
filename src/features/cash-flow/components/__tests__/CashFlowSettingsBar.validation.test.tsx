import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CashFlowSettingsBar } from "../CashFlowSettingsBar";

const state = vi.hoisted(() => ({
  settings: { id: "company-1", initialBalance: 1_000, safetyBuffer: 100 },
  mutate: vi.fn(),
}));

vi.mock("../../hooks/useCashFlowSettings", () => ({
  useCashFlowSettings: () => ({ data: state.settings, isLoading: false }),
  useUpdateCashFlowSettings: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: "admin" }) }));

beforeEach(() => {
  state.settings = { id: "company-1", initialBalance: 1_000, safetyBuffer: 100 };
  state.mutate.mockClear();
});
afterEach(cleanup);

const fields = [
  { name: "Saldo inicial (MXN)", key: "initialBalance" },
  { name: "Colchón mínimo (MXN)", key: "safetyBuffer" },
] as const;

describe("CashFlowSettingsBar: importes explícitos", () => {
  it.each(fields)("no guarda $name vacío aunque el otro importe haya cambiado", ({ name, key }) => {
    render(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    const input = screen.getByRole("spinbutton", { name });
    const other = fields.find((field) => field.key !== key)!;
    fireEvent.change(screen.getByRole("spinbutton", { name: other.name }), { target: { value: "200" } });
    fireEvent.change(input, { target: { value: "" } });

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Captura un importe; puedes escribir 0");
    const save = screen.getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it.each(fields)("permite guardar cero explícito en $name", ({ name, key }) => {
    render(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    const input = screen.getByRole("spinbutton", { name });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "0" } });

    expect(input).toHaveAttribute("aria-invalid", "false");
    const save = screen.getByRole("button", { name: "Guardar" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(state.mutate).toHaveBeenCalledExactlyOnceWith({ ...state.settings, [key]: 0 }, expect.any(Object));
  });

  it.each(fields)("conserva la restricción de importes no negativos en $name", ({ name }) => {
    render(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton", { name }), { target: { value: "-1" } });

    expect(screen.getByText("El importe no puede ser negativo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("conserva decimales y el cero previamente guardado", () => {
    state.settings.safetyBuffer = 0;
    render(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Saldo inicial (MXN)" }), { target: { value: "123.45" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(state.mutate).toHaveBeenCalledExactlyOnceWith({ id: "company-1", initialBalance: 123.45, safetyBuffer: 0 }, expect.any(Object));
  });

  it("retains dirty amounts through remote updates and marks only a successful submission as the new baseline", () => {
    const view = render(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Saldo inicial (MXN)"), { target: { value: "2500" } });
    state.settings = { ...state.settings, initialBalance: 1100 };
    view.rerender(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    expect(screen.getByLabelText("Saldo inicial (MXN)")).toHaveValue(2500);
    expect(screen.getByRole("status")).toHaveTextContent("Conservamos tus cambios");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    act(() => state.mutate.mock.calls[0][1].onSuccess());
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByLabelText("Saldo inicial (MXN)")).toHaveValue(2500);
    fireEvent.change(screen.getByLabelText("Saldo inicial (MXN)"), { target: { value: "2600" } });
    state.settings = { ...state.settings, initialBalance: 2500 };
    view.rerender(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    expect(screen.getByLabelText("Saldo inicial (MXN)")).toHaveValue(2600);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("synchronizes pristine fields and treats clearing an existing zero as dirty", () => {
    const view = render(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    state.settings = { ...state.settings, initialBalance: 1100, safetyBuffer: 0 };
    view.rerender(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    expect(screen.getByLabelText("Saldo inicial (MXN)")).toHaveValue(1100);
    fireEvent.change(screen.getByLabelText("Colchón mínimo (MXN)"), { target: { value: "" } });
    state.settings = { ...state.settings, initialBalance: 1200 };
    view.rerender(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    expect(screen.getByLabelText("Colchón mínimo (MXN)")).toHaveValue(null);
    expect(screen.getByLabelText("Saldo inicial (MXN)")).toHaveValue(1100);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("adopts the latest remote values when the user undoes all local changes", () => {
    const view = render(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Saldo inicial (MXN)"), { target: { value: "2500" } });
    state.settings = { ...state.settings, initialBalance: 1100 };
    view.rerender(<CashFlowSettingsBar weeks={4} onChangeWeeks={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Saldo inicial (MXN)"), { target: { value: "1000" } });
    expect(screen.getByLabelText("Saldo inicial (MXN)")).toHaveValue(1100);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });
});
