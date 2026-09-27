import { createElement, type ReactNode } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-pdf/renderer", () => {
  const tag = (name: string) => ({ children }: { children?: ReactNode }) => createElement(name, null, children);
  return {
    Document: tag("section"), Page: tag("section"), View: tag("div"), Text: tag("span"), Image: tag("img"),
    StyleSheet: { create: <T,>(styles: T) => styles },
  };
});

import { ContractDocument } from "../ContractDocument";
import { company, contract, template } from "./__fixtures__/pdfFixtures";

afterEach(cleanup);

function renderContract(mode: "full" | "contract" | "checklist" | "pagare", terms: string | null) {
  return render(<ContractDocument
    mode={mode} contract={{ ...contract, terms_text: terms }} tpl={template}
    vars={{ ciudad: "Monterrey" }} logoBase64={null} company={company}
    customer={{ name: "Cliente QA" }} forklift={null}
  />);
}

describe("Condiciones particulares del PDF contractual", () => {
  it.each(["full", "contract"] as const)("imprime el texto capturado una vez antes de las firmas en modo %s", (mode) => {
    const terms = "No trasladar la unidad.\nAvisar antes del siguiente turno. {texto literal}";
    const { container } = renderContract(mode, terms);
    expect(screen.getAllByText("III. CONDICIONES PARTICULARES")).toHaveLength(1);
    const content = container.textContent || "";
    expect(content).toContain(terms);
    expect(content.indexOf(terms)).toBeLessThan(content.indexOf("Leído el presente contrato"));
    expect(content).toContain("Objeto del contrato.");
  });

  it.each([null, "", " \n\t "])("omite la sección si no hay condiciones: %j", (terms) => {
    renderContract("contract", terms);
    expect(screen.queryByText("III. CONDICIONES PARTICULARES")).not.toBeInTheDocument();
  });

  it.each(["checklist", "pagare"] as const)("no añade condiciones del cuerpo contractual al modo %s", (mode) => {
    renderContract(mode, "Condición particular exclusiva del contrato");
    expect(screen.queryByText("Condición particular exclusiva del contrato")).not.toBeInTheDocument();
  });
});
