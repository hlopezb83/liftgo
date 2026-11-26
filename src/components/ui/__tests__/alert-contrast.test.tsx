import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert, AlertDescription, AlertTitle } from "../alert";

describe("Alert — V01", () => {
  it.each([
    ["warning", "text-warning-text", "[&>svg]:text-warning-text"],
    ["info", "text-info-text", "[&>svg]:text-info-text"],
  ] as const)("usa %s-text para texto e icono sin cambiar el borde ni el rol", (variant, textClass, iconClass) => {
    const { container } = render(
      <Alert variant={variant}>
        <svg aria-hidden="true" />
        <AlertTitle>Aviso</AlertTitle>
        <AlertDescription>Detalle</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass(textClass, iconClass);
    expect(alert).not.toHaveClass(`text-${variant}`, `[&>svg]:text-${variant}`);
    expect(alert).toHaveClass(`border-${variant}/50`, `dark:border-${variant}`);
    expect(container.querySelector("svg")?.parentElement).toBe(alert);
    expect(screen.getByRole("heading").parentElement).toBe(alert);
  });

  it.each(["destructive", "success"] as const)("conserva la variante %s", (variant) => {
    render(<Alert variant={variant} />);
    expect(screen.getByRole("alert")).toHaveClass(`text-${variant}`, `[&>svg]:text-${variant}`, `border-${variant}/50`, `dark:border-${variant}`);
  });

  it("conserva la variante predeterminada", () => {
    render(<Alert />);
    expect(screen.getByRole("alert")).toHaveClass("bg-background", "text-foreground");
  });
});