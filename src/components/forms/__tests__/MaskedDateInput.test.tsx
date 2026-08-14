import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MaskedDateInput } from "../MaskedDateInput";

const TODAY = new Date(2026, 7, 14); // 14/08/2026

function Harness() {
  const [value, setValue] = useState<Date | undefined>(undefined);
  return (
    <>
      <MaskedDateInput value={value} onChange={setValue} today={TODAY} aria-label="Fecha" />
      <output data-testid="out">{value ? value.toDateString() : "vacío"}</output>
    </>
  );
}

const input = () => screen.getByLabelText("Fecha") as HTMLInputElement;
const out = () => screen.getByTestId("out").textContent;

/** Simula tecleo de dígitos (el input aplica la máscara al cambiar). */
function type(digits: string) {
  let current = "";
  for (const ch of digits) {
    current += ch;
    fireEvent.change(input(), { target: { value: input().value + ch } });
    expect(current).toBeTruthy();
  }
}

describe("MaskedDateInput", () => {
  it("teclear 8 dígitos produce la fecha con máscara", () => {
    render(<Harness />);
    type("15092026");
    expect(input().value).toBe("15/09/2026");
    expect(out()).toBe(new Date(2026, 8, 15).toDateString());
  });

  it("acepta pegado en formato ISO", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "2026-09-15" } });
    expect(input().value).toBe("15/09/2026");
  });

  it("H escribe la fecha de hoy", () => {
    render(<Harness />);
    fireEvent.keyDown(input(), { key: "h" });
    expect(input().value).toBe("14/08/2026");
    expect(out()).toBe(TODAY.toDateString());
  });

  it("ArrowUp ajusta el segmento activo (día)", () => {
    render(<Harness />);
    fireEvent.keyDown(input(), { key: "h" });
    input().setSelectionRange(1, 1);
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().value).toBe("15/08/2026");
  });

  it("con el cursor al final ajusta el año", () => {
    render(<Harness />);
    fireEvent.keyDown(input(), { key: "h" });
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().value).toBe("14/08/2027");
  });


  it("+ sobre el segmento de mes avanza el mes", () => {
    render(<Harness />);
    fireEvent.keyDown(input(), { key: "h" });
    input().setSelectionRange(4, 4);
    fireEvent.keyDown(input(), { key: "+" });
    expect(input().value).toBe("14/09/2026");
  });

  it("marca error en fechas imposibles", () => {
    render(<Harness />);
    type("31022026");
    expect(screen.getByText("31/02/2026 no existe")).toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(out()).toBe("vacío");
  });

  it("Escape limpia el campo", () => {
    render(<Harness />);
    type("15092026");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().value).toBe("");
    expect(out()).toBe("vacío");
  });
});
