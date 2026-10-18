import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KpiTile } from "../KpiTile";

/**
 * V05: la escala tipográfica del valor depende de `valueSize` y de la
 * longitud, nunca del tipo (string vs number). jsdom no mide geometría; aquí
 * se verifica la clase resuelta y que el contenido se renderiza intacto.
 */
function valueParagraph(container: HTMLElement): HTMLElement {
  const el = container.querySelector("p.tabular-nums");
  if (!el) throw new Error("No se encontró el párrafo del valor");
  return el as HTMLElement;
}

describe("KpiTile · escala del valor (V05)", () => {
  it("trata igual number y string con el mismo contenido", () => {
    const asNumber = render(<KpiTile label="A" value={123} />);
    const asString = render(<KpiTile label="B" value="123" />);
    expect(valueParagraph(asNumber.container).className).toBe(
      valueParagraph(asString.container).className,
    );
  });

  it("escala sm: hasta 10 caracteres usa text-lg", () => {
    const { container } = render(<KpiTile label="A" value="0123456789" />);
    expect(valueParagraph(container).className).toContain("text-lg");
  });

  it("escala sm: 11-12 caracteres usa text-base", () => {
    const { container: c11 } = render(<KpiTile label="A" value="01234567890" />);
    const { container: c12 } = render(<KpiTile label="A" value="012345678901" />);
    expect(valueParagraph(c11).className).toContain("text-base");
    expect(valueParagraph(c12).className).toContain("text-base");
  });

  it("escala sm: 13+ caracteres usa text-sm y nunca baja de ahí", () => {
    const { container: c13 } = render(<KpiTile label="A" value="0123456789012" />);
    const { container: cLong } = render(<KpiTile label="A" value="$12,345,678.90 MXN" />);
    expect(valueParagraph(c13).className).toContain("text-sm");
    expect(valueParagraph(cLong).className).toContain("text-sm");
    expect(valueParagraph(cLong).className).not.toContain("text-xs");
  });

  it("escala lg: hasta 10 text-2xl, 11-12 text-xl, 13-14 text-lg, 15+ text-base", () => {
    const cases: Array<[string, string]> = [
      ["0123456789", "text-2xl"],
      ["01234567890", "text-xl"],
      ["012345678901", "text-xl"],
      ["0123456789012", "text-lg"],
      ["01234567890123", "text-lg"],
      ["012345678901234", "text-base"],
    ];
    for (const [value, expected] of cases) {
      const { container, unmount } = render(<KpiTile label="A" value={value} valueSize="lg" />);
      expect(valueParagraph(container).className).toContain(expected);
      unmount();
    }
  });

  it("valores especiales: 0, negativos y porcentajes se miden por longitud", () => {
    const { container: zero } = render(<KpiTile label="A" value={0} />);
    expect(valueParagraph(zero.container).className).toContain("text-lg");
    expect(valueParagraph(zero.container).textContent).toBe("0");

    const { container: neg } = render(<KpiTile label="A" value="-$1,234.56" />);
    expect(valueParagraph(neg.container).textContent).toBe("-$1,234.56");

    const { container: pct } = render(<KpiTile label="A" value="12.5%" valueSize="lg" />);
    expect(valueParagraph(pct.container).className).toContain("text-2xl");
    expect(valueParagraph(pct.container).textContent).toBe("12.5%");
  });

  it("importes largos conservan signos, decimales y moneda sin truncar", () => {
    const value = "$12,345,678.90";
    const { container } = render(<KpiTile label="A" value={value} />);
    const el = valueParagraph(container);
    expect(el.textContent).toBe(value);
    expect(el.className).not.toContain("truncate");
  });

  it("ReactNode no se convierte a string y usa el tamaño base de su escala", () => {
    const node = <span data-testid="custom">$1,234</span>;
    const { container } = render(<KpiTile label="A" value={node} />);
    expect(screen.getByTestId("custom")).toBeTruthy();
    expect(valueParagraph(container).className).toContain("text-lg");

    const { container: lg } = render(<KpiTile label="A" value={node} valueSize="lg" />);
    expect(valueParagraph(lg.container).className).toContain("text-2xl");
  });
});

describe("KpiTile · estructura e interacción", () => {
  it("reserva la altura de 2 líneas para la etiqueta y conserva el texto completo", () => {
    const long = "Ingreso Mensual Recurrente";
    const { container } = render(<KpiTile label={long} value="$1,000" />);
    const label = screen.getByText(long);
    expect(label.className).toContain("min-h-[2.5em]");
    expect(label.className).toContain("line-clamp-2");
    expect(label.getAttribute("title")).toBe(long);
    expect(container.querySelector("p.tabular-nums")).toBeTruthy();
  });

  it("etiqueta corta de 1 línea mantiene la misma zona reservada", () => {
    render(<KpiTile label="MRR" value="$1,000" />);
    const label = screen.getByText("MRR");
    expect(label.className).toContain("min-h-[2.5em]");
  });

  it("con href renderiza enlace navegable", () => {
    render(<KpiTile label="A" value="1" href="/panel" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/panel");
  });

  it("con onClick renderiza botón enfocable que responde a clic", () => {
    const onClick = vi.fn();
    render(<KpiTile label="A" value="1" onClick={onClick} />);
    const button = screen.getByRole("button");
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
