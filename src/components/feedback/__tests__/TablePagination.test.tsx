import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TablePagination } from "../TablePagination";

/**
 * V26-01: a 320/390px la numeración completa desbordaba el pie de tabla.
 * En móvil se muestra un indicador compacto "N de M" y los números quedan
 * reservados para `sm+`; Anterior/Siguiente siempre presentes y operables.
 */
describe("TablePagination (V26-01)", () => {
  it("muestra indicador compacto y oculta los números en móvil", () => {
    render(<TablePagination page={3} totalPages={12} onPageChange={vi.fn()} />);

    expect(screen.getByText("3 de 12")).toBeInTheDocument();

    const numeric = screen.getByRole("button", { name: "3" });
    // El contenedor <li> de cada número es `hidden` hasta el breakpoint sm.
    expect(numeric.closest("li")?.className).toContain("hidden");
    expect(numeric.closest("li")?.className).toContain("sm:block");
  });

  it("mantiene Anterior/Siguiente en los tres estados", () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <TablePagination page={1} totalPages={5} onPageChange={onPageChange} />,
    );
    expect(screen.getByRole("button", { name: /página anterior/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /página siguiente/i })).toBeEnabled();

    rerender(<TablePagination page={3} totalPages={5} onPageChange={onPageChange} />);
    expect(screen.getByRole("button", { name: /página anterior/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /página siguiente/i })).toBeEnabled();
    expect(screen.getByText("3 de 5")).toBeInTheDocument();

    rerender(<TablePagination page={5} totalPages={5} onPageChange={onPageChange} />);
    expect(screen.getByRole("button", { name: /página siguiente/i })).toBeDisabled();
    expect(screen.getByText("5 de 5")).toBeInTheDocument();
  });
});
