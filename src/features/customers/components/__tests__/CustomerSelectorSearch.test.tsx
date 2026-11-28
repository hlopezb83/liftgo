import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CustomerSelector } from "../CustomerSelector";

const mocks = vi.hoisted(() => ({ search: vi.fn(), detail: vi.fn<(id: string | undefined) => { data: { id: string; name: string } | null }>(() => ({ data: null })) }));

vi.mock("../../hooks/customerQueries", () => ({
  useCustomer: (id: string | undefined) => mocks.detail(id),
  useCustomerSelectorSearch: (search: string, enabled: boolean) => mocks.search(search, enabled),
}));

describe("CustomerSelector remote search", () => {
  it("reemplaza el contacto al cambiar cliente, permite captura manual y limpia la selección", () => {
    const customers = [
      { id: "a", name: "Cliente A", email: "a@example.com" },
      { id: "b", name: "Cliente B", email: null },
    ];
    mocks.search.mockReturnValue({ data: undefined, isSearchPending: false, isFetching: false, isError: false });
    function Form() {
      const [id, setId] = useState("");
      const [name, setName] = useState("");
      const [contact, setContact] = useState("");
      return <CustomerSelector customers={customers} customerId={id} customerName={name}
        onCustomerIdChange={setId} onCustomerNameChange={setName}
        customerContact={contact} onCustomerContactChange={setContact} />;
    }
    render(<Form />);
    const select = (name: string) => {
      fireEvent.click(screen.getByRole("combobox", { name: /Cliente/ }));
      fireEvent.click(screen.getByRole("option", { name }));
    };
    select("Cliente A");
    expect(screen.getByLabelText("Contacto")).toHaveValue("a@example.com");
    select("Cliente B");
    expect(screen.getByLabelText("Contacto")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Contacto"), { target: { value: "contacto de B" } });
    expect(screen.getByLabelText("Contacto")).toHaveValue("contacto de B");
    select("Cliente A");
    expect(screen.getByLabelText("Contacto")).toHaveValue("a@example.com");
    const trigger = screen.getByRole("combobox", { name: /Cliente A/ });
    const clear = screen.getByRole("button", { name: "Limpiar cliente" });
    expect(clear.tagName).toBe("BUTTON");
    expect(clear).toHaveAttribute("type", "button");
    expect(trigger).not.toContainElement(clear);
    clear.focus();
    fireEvent.click(clear);
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Limpiar cliente" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Contacto")).toHaveValue("");
    expect(screen.getByLabelText("Nombre del Cliente")).toHaveValue("");
  });

  it("mantiene el nombre elegido mientras llega la ficha correcta y al cambiar de cliente", () => {
    const remote = { id: "remote", name: "Cliente Remoto" };
    mocks.search.mockImplementation((term: string, enabled: boolean) => ({
      data: enabled && term === "remoto" ? { customers: [remote], isTruncated: false } : undefined,
      isSearchPending: false, isFetching: false, isError: false,
    }));
    const props = { customers: [{ id: "initial", name: "Cliente Inicial" }], hideManualName: true,
      customerName: "", onCustomerIdChange: vi.fn(), onCustomerNameChange: vi.fn() };
    const view = render(<CustomerSelector {...props} customerId="" />);
    fireEvent.click(screen.getByRole("combobox", { name: /Seleccionar cliente/ }));
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre, razón social o RFC…"), { target: { value: "remoto" } });
    fireEvent.click(screen.getByRole("option", { name: "Cliente Remoto" }));
    mocks.detail.mockReturnValueOnce({ data: { id: "anterior", name: "Cliente Anterior" } });
    view.rerender(<CustomerSelector {...props} customerId="remote" />);
    const trigger = screen.getByRole("combobox", { name: /Cliente Remoto/ });
    expect(trigger).toBeVisible();
    expect(mocks.detail).toHaveBeenLastCalledWith("remote");
    mocks.detail.mockReturnValueOnce({ data: { id: "remote", name: "Cliente Registrado" } });
    view.rerender(<CustomerSelector {...props} customerId="remote" />);
    expect(screen.getByRole("combobox", { name: /Cliente Registrado/ })).toBeVisible();
    view.rerender(<CustomerSelector {...props} customerId="otro" />);
    expect(screen.getByRole("combobox", { name: /Seleccionar cliente/ })).toBeVisible();

  });

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

describe("CustomerSelector con consulta inicial", () => {
  const input = () => screen.getByPlaceholderText("Buscar por nombre, razón social o RFC…");
  const picker = () => screen.getByRole("combobox", { name: /Cliente/ });
  const helpText = "Si tu cliente no aparece, regístralo primero en el módulo de Clientes.";

  it("distingue la carga de un vacío confirmado y difiere la sugerencia de alta", () => {
    mocks.search.mockReturnValue({ data: undefined, isSearchPending: false, isFetching: false, isError: false });
    const props = { required: true, hideManualName: true, customerId: "", customerName: "",
      onCustomerIdChange: vi.fn(), onCustomerNameChange: vi.fn(), helpText };
    const view = render(<CustomerSelector {...props} customers={undefined} />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando cartera…");
    expect(screen.queryByText(helpText)).not.toBeInTheDocument();
    fireEvent.click(picker());
    expect(input()).toBeEnabled();
    expect(screen.getByText("Cargando cartera…")).toBeVisible();
    expect(screen.queryByText("Sin resultados.")).not.toBeInTheDocument();

    view.rerender(<CustomerSelector {...props} customers={[]} />);
    expect(screen.getByText("Sin resultados.")).toBeVisible();
    expect(screen.getByText(helpText)).toBeVisible();
  });

  it("permite reintentar la cartera y elegir por búsqueda remota pese al error inicial", () => {
    const customer = { id: "remoto", name: "Cliente remoto", rfc: "ABC010101ABC", regimen_fiscal: "612" };
    mocks.search.mockImplementation((term: string, enabled: boolean) => ({
      data: enabled && term === "ABC010101ABC" ? { customers: [customer], isTruncated: false } : undefined,
      isSearchPending: false, isFetching: false, isError: false,
    }));
    const refetch = vi.fn();
    const onCustomerSelect = vi.fn();
    const props = { required: true, hideManualName: true, customerId: "", customerName: "",
      onCustomerIdChange: vi.fn(), onCustomerNameChange: vi.fn(), onCustomerSelect, helpText };
    const view = render(<CustomerSelector {...props} customers={undefined}
      customerListQuery={{ isError: true, isFetching: false, refetch }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar la cartera de clientes.");
    fireEvent.click(picker());
    expect(screen.getByText("No se pudo cargar la cartera de clientes.")).toBeVisible();
    expect(screen.queryByText(helpText)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar cartera" }));
    expect(refetch).toHaveBeenCalledOnce();

    view.rerender(<CustomerSelector {...props} customers={undefined}
      customerListQuery={{ isError: true, isFetching: true, refetch }} />);
    expect(input()).toHaveFocus();
    expect(screen.getByText("Cargando cartera…")).toBeVisible();
    expect(screen.queryByText("Sin resultados.")).not.toBeInTheDocument();
    fireEvent.change(input(), { target: { value: "ABC010101ABC" } });
    fireEvent.click(screen.getByRole("option", { name: "Cliente remoto" }));
    expect(onCustomerSelect).toHaveBeenCalledExactlyOnceWith(customer);
    expect(props.onCustomerIdChange).not.toHaveBeenCalled();
  });
});
