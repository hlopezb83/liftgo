import { render, screen, act } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { PageActionsProvider } from "../PageActionsContext";
import { usePageActionsContext, type PageActions } from "../pageActions";

function Register({ actions }: { actions: PageActions }) {
  const { register } = usePageActionsContext();
  useEffect(() => register(actions), [register, actions]);
  return null;
}

function Label() {
  const { actions } = usePageActionsContext();
  return <span data-testid="label">{actions.newLabel ?? "vacío"}</span>;
}

const A: PageActions = { newLabel: "A" };
const B: PageActions = { newLabel: "B" };

describe("PageActionsProvider", () => {
  it("expone las acciones del último registrante", () => {
    render(
      <PageActionsProvider>
        <Register actions={A} />
        <Label />
      </PageActionsProvider>,
    );
    expect(screen.getByTestId("label").textContent).toBe("A");
  });

  it("restaura el registrante anterior al desmontar el último", () => {
    const { rerender } = render(
      <PageActionsProvider>
        <Register actions={A} />
        <Register actions={B} />
        <Label />
      </PageActionsProvider>,
    );
    expect(screen.getByTestId("label").textContent).toBe("B");

    act(() => {
      rerender(
        <PageActionsProvider>
          <Register actions={A} />
          <Label />
        </PageActionsProvider>,
      );
    });
    expect(screen.getByTestId("label").textContent).toBe("A");
  });

  it("vuelve a vacío cuando no queda ningún registrante", () => {
    const { rerender } = render(
      <PageActionsProvider>
        <Register actions={A} />
        <Label />
      </PageActionsProvider>,
    );
    rerender(
      <PageActionsProvider>
        <Label />
      </PageActionsProvider>,
    );
    expect(screen.getByTestId("label").textContent).toBe("vacío");
  });

  it("desmontaje fuera de orden no deja acciones huérfanas", () => {
    const { rerender } = render(
      <PageActionsProvider>
        <Register actions={A} />
        <Register actions={B} />
        <Label />
      </PageActionsProvider>,
    );
    // Se desmonta el registrante intermedio (A), no el último (B).
    rerender(
      <PageActionsProvider>
        <Register actions={B} />
        <Label />
      </PageActionsProvider>,
    );
    expect(screen.getByTestId("label").textContent).toBe("B");
  });
});
