import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert, AlertDescription, AlertTitle } from "../alert";

describe("Alert — V01", () => {
  it("usa warning-text para texto e icono sin cambiar el borde ni el rol", () => {
    const { container } = render(
      <Alert variant="warning">
        <svg aria-hidden="true" />
        <AlertTitle>Aviso</AlertTitle>
        <AlertDescription>Detalle</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("text-warning-text", "[&>svg]:text-warning-text");
    expect(alert).not.toHaveClass("text-warning", "[&>svg]:text-warning");
    expect(alert).toHaveClass("border-warning/50", "dark:border-warning");
    expect(container.querySelector("svg")?.parentElement).toBe(alert);
    expect(screen.getByRole("heading").parentElement).toBe(alert);
  });

  it.each(["destructive", "success", "info"] as const)("conserva la variante %s", (variant) => {
    render(<Alert variant={variant} />);
    expect(screen.getByRole("alert")).toHaveClass(`text-${variant}`, `[&>svg]:text-${variant}`, `border-${variant}/50`, `dark:border-${variant}`);
  });

  it("conserva la variante predeterminada", () => {
    render(<Alert />);
    expect(screen.getByRole("alert")).toHaveClass("bg-background", "text-foreground");
  });
});