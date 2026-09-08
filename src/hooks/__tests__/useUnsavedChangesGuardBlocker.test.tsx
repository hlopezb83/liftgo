import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import { useLocation, useNavigate } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import { useUnsavedChangesGuard } from "../useUnsavedChangesGuard";

/**
 * TS-03: exactamente una confirmación por intento de navegación, aunque el
 * formulario vuelva a renderizar por un estado ajeno al bloqueo.
 */

let forceRerender: (() => void) | null = null;

function Harness({ dirty }: { dirty: boolean }) {
  const [tick, setTick] = useState(0);
  forceRerender = () => setTick((t) => t + 1);
  useUnsavedChangesGuard(dirty);
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="tick">{tick}</span>
      <button type="button" onClick={() => navigate("/other")}>
        Ir a otra
      </button>
    </div>
  );
}

function setup(dirty = true) {
  return render(
    <TestRouter>
      <ConfirmProvider>
        <Harness dirty={dirty} />
      </ConfirmProvider>
    </TestRouter>,
  );
}

describe("useUnsavedChangesGuard + useBlocker", () => {
  it("pide una sola confirmación aunque haya renders extra, y confirmar navega", async () => {
    setup();
    await screen.findByTestId("path");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ir a otra" })); });
    await screen.findByText("¿Descartar cambios?");

    // Render ajeno al bloqueo mientras el diálogo está abierto.
    await act(async () => {
      forceRerender?.();
    });
    expect(screen.getAllByText("¿Descartar cambios?")).toHaveLength(1);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descartar" })); });
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/other"));
  });

  it("cancelar conserva la página y permite reintentar", async () => {
    setup();
    await screen.findByTestId("path");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ir a otra" })); });
    await screen.findByText("¿Descartar cambios?");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Seguir editando" })); });
    await waitFor(() =>
      expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("path").textContent).toBe("/");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ir a otra" })); });
    await screen.findByText("¿Descartar cambios?");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Descartar" })); });
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/other"));
  });

  it("sin cambios sin guardar navega sin aviso", async () => {
    setup(false);
    await screen.findByTestId("path");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ir a otra" })); });
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/other"));
    expect(screen.queryByText("¿Descartar cambios?")).not.toBeInTheDocument();
  });
});
