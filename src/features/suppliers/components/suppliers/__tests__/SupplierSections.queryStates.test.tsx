import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type SupabaseMockResponse } from "@/test/helpers/supabaseChain";
import { SupplierContactsSection } from "../SupplierContactsSection";
import { SupplierBankAccountsSection } from "../SupplierBankAccountsSection";

const state = vi.hoisted(() => ({ response: { data: [], error: null } as SupabaseMockResponse, reads: 0 }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ fromResolver: () => { state.reads++; return state.response; } }),
}));
vi.mock("@/components/feedback/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: () => null }));
vi.mock("../SupplierContactFormDialog", () => ({ SupplierContactFormDialog: () => null }));
vi.mock("../SupplierBankAccountFormDialog", () => ({ SupplierBankAccountFormDialog: () => null }));

const sections = [
  { name: "contactos", Component: SupplierContactsSection, error: "No se pudo cargar los contactos",
    empty: "Sin contactos registrados.", row: { id: "contact-1", name: "Contacto de prueba" }, label: "Contacto de prueba" },
  { name: "cuentas bancarias", Component: SupplierBankAccountsSection, error: "No se pudo cargar las cuentas bancarias",
    empty: "Sin cuentas bancarias registradas.", row: { id: "account-1", bank_name: "Banco de prueba", account_holder: "QA", clabe: null, currency: "MXN" }, label: "Banco de prueba" },
];
afterEach(cleanup);
beforeEach(() => { state.reads = 0; state.response = { data: null, error: { message: "Lectura no disponible" } }; });

describe.each(sections)("$name: disponibilidad de la consulta", ({ Component, error, empty, row, label }) => {
  it.each([false, true])("reintenta un fallo sin inventar cero y recupera datos (vacío=%s)", async (isEmpty) => {
    render(<Component supplierId="supplier-1" />, { wrapper: createQueryWrapper().Wrapper });
    expect(screen.queryByText("(0)")).not.toBeInTheDocument();
    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(screen.queryByText(empty)).not.toBeInTheDocument();
    expect(screen.queryByText("(0)")).not.toBeInTheDocument();

    state.response = { data: isEmpty ? [] : [row], error: null };
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(isEmpty ? empty : label)).toBeInTheDocument();
    expect(screen.getByText(isEmpty ? "(0)" : "(1)")).toBeInTheDocument();
    expect(screen.queryByText(error)).not.toBeInTheDocument();
    expect(state.reads).toBe(2);
  });

  it("oculta el conteo y las filas anteriores si falla una recarga", async () => {
    state.response = { data: [row], error: null };
    const { Wrapper, queryClient } = createQueryWrapper();
    render(<Component supplierId="supplier-1" />, { wrapper: Wrapper });
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByText("(1)")).toBeInTheDocument();
    state.response = { data: null, error: { message: "Recarga no disponible" } };
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(screen.queryByText(label)).not.toBeInTheDocument();
    expect(screen.queryByText("(1)")).not.toBeInTheDocument();
    expect(screen.queryByText(empty)).not.toBeInTheDocument();
  });
});
