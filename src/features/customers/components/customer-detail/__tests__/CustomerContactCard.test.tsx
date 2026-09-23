import { render, screen } from "@testing-library/react";
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
