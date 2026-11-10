import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Facturapi6Preview } from "../Facturapi6Preview";
const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => run }));
vi.mock("@/lib/qa/facturapi6-preview/preflight.functions", () => ({ previewIssuerPreflight: vi.fn() }));
it("ni montaje ni clic con ejecución deshabilitada envían petición", () => {
  render(<Facturapi6Preview />);
  expect(run).not.toHaveBeenCalled();
  const button = screen.getByRole("button", { name: /Comprobar emisor/ });
  expect(button).toBeDisabled(); fireEvent.click(button);
  expect(run).not.toHaveBeenCalled();
});
