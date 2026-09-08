import { render, act, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TestRouter } from "@/test/router";
import { useUnsavedChangesGuard } from "../useUnsavedChangesGuard";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";

function Harness({ isDirty }: { isDirty: boolean }) {
  useUnsavedChangesGuard(isDirty);
  return <div data-testid="harness-ready" />;
}

function renderWithProviders(isDirty: boolean) {
  return render(
    <TestRouter>
      <ConfirmProvider>
        <Harness isDirty={isDirty} />
      </ConfirmProvider>
    </TestRouter>,
  );
}


describe("useUnsavedChangesGuard", () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, "addEventListener");
    removeSpy = vi.spyOn(window, "removeEventListener");
  });
  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  function countBeforeunload(spy: ReturnType<typeof vi.spyOn>) {
    return (spy.mock.calls as unknown[][]).filter((c) => c[0] === "beforeunload").length;
  }


  it("no registra beforeunload cuando isDirty=false", async () => {
    renderWithProviders(false);
    await screen.findByTestId("harness-ready");
    expect(countBeforeunload(addSpy)).toBe(0);
  });

  it("registra beforeunload cuando isDirty=true y lo remueve al desmontar", async () => {
    const { unmount } = renderWithProviders(true);
    await screen.findByTestId("harness-ready");
    expect(countBeforeunload(addSpy)).toBe(1);
    unmount();
    expect(countBeforeunload(removeSpy)).toBeGreaterThanOrEqual(1);
  });

  it("previene el evento y setea returnValue cuando hay cambios sin guardar", async () => {
    renderWithProviders(true);
    await screen.findByTestId("harness-ready");
    const handler = (addSpy.mock.calls as unknown[][]).find((c) => c[0] === "beforeunload")?.[1] as
      | ((e: BeforeUnloadEvent) => void)
      | undefined;

    expect(handler).toBeDefined();
    const evt = {
      preventDefault: vi.fn(),
      returnValue: "unset",
    } as unknown as BeforeUnloadEvent;
    act(() => handler?.(evt));
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(evt.returnValue).toBe("");
  });
});
