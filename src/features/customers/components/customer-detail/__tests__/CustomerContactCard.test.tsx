import { render, screen, within } from "@testing-library/react";
import type { Tables } from "@/integrations/supabase/types";
import { CustomerContactCard } from "../CustomerContactCard";

function customer(website: string): Tables<"customers"> {
  return {
    name: "HYVA DE MEXICO",
    email: "r.martinez@hyva.com",
    phone: "(81) 2040 7668",
    website,
  } as Tables<"customers">;
}

it("ofrece acciones de contacto y normaliza sitios sin protocolo", () => {
  render(<CustomerContactCard customer={customer("www.hyva.com")} />);

  expect(screen.getByRole("link", { name: "r.martinez@hyva.com" })).toHaveAttribute(
    "href", "mailto:r.martinez@hyva.com",
  );
  expect(screen.getByRole("link", { name: "(81) 2040 7668" })).toHaveAttribute(
    "href", "tel:8120407668",
  );
  expect(screen.getByRole("link", { name: "www.hyva.com" })).toHaveAttribute(
    "href", "https://www.hyva.com/",
  );
});

it("no convierte esquemas ajenos en enlaces", () => {
  render(<CustomerContactCard customer={customer("javascript:alert(1)")} />);
  expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "javascript:alert(1)" })).not.toBeInTheDocument();
});

it("agrupa datos fiscales existentes sin mezclarlos con las acciones de contacto", () => {
  const contact = "QA Contacto de Operaciones Industriales del Norte de México";
  const representative = "QA Representante Legal de Servicios Industriales de Larga Duración";
  render(<CustomerContactCard customer={{ ...customer("example.invalid"), contact_person: contact,
    representante_legal: representative, rfc: null, tax_id: "XAXX010101000" } as Tables<"customers">} />);

  const contactRegion = screen.getByRole("region", { name: "Contacto" });
  const fiscalRegion = screen.getByRole("region", { name: "Datos fiscales" });
  expect(within(contactRegion).getByText(contact)).toBeInTheDocument();
  expect(within(contactRegion).getByRole("link", { name: "r.martinez@hyva.com" })).toBeInTheDocument();
  expect(within(fiscalRegion).getByText("XAXX010101000")).toBeInTheDocument();
  expect(within(fiscalRegion).getByText(representative)).toBeInTheDocument();
  expect(within(contactRegion).queryByText(representative)).not.toBeInTheDocument();
});

it("no crea una sección fiscal vacía si el registro carece de esos datos", () => {
  render(<CustomerContactCard customer={customer("example.invalid")} />);
  expect(screen.queryByRole("region", { name: "Datos fiscales" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Contacto" })).toBeInTheDocument();
});
