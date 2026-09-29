import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerSelector } from "../CustomerSelector";

const mocks = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock("../../../hooks/customers/customerQueries", () => ({
  useCustomer: () => ({ data: null }),
  useCustomerSelectorSearch: (search: string, enabled: boolean) => mocks.search(search, enabled),
}));

describe("CustomerSelector remote search", () => {
  it("finds a customer outside the capped list by RFC and selects it", async () => {
    const remoteCustomer = {
      id: "customer-902",
      name: "Transportes del Norte",
      company: null,
      email: "compras@example.com",
    };
    mocks.search.mockImplementation((search: string, enabled: boolean) => ({
      data: enabled && search === "TND-902" ? { customers: [remoteCustomer], isTruncated: false } : undefined,
      isSearchPending: false,
      isFetching: false,
      isError: false,
    }));
    const onCustomerIdChange = vi.fn();
    const onCustomerNameChange = vi.fn();

    render(
      <CustomerSelector
        customers={[{ id: "customer-1", name: "Cliente inicial" }]}
        customerId=""
        customerName=""
        onCustomerIdChange={onCustomerIdChange}
        onCustomerNameChange={onCustomerNameChange}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: /Cliente/ }));
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre, razón social o RFC…"), {
      target: { value: "TND-902" },
    });

    const result = await screen.findByRole("option", { name: "Transportes del Norte" });
    fireEvent.click(result);

    expect(onCustomerIdChange).toHaveBeenCalledWith("customer-902");
    expect(onCustomerNameChange).toHaveBeenCalledWith("Transportes del Norte");
  });
});
