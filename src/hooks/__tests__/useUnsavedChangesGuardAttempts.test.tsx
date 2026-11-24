import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import { useUnsavedChangesGuard } from "../useUnsavedChangesGuard";

const router = vi.hoisted(() => ({
  resolver: { status: "idle", proceed: undefined, reset: undefined } as {
    status: "idle" | "blocked";
    proceed?: () => void;
    reset?: () => void;
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  useRouter: () => ({ options: { stringifySearch: () => "" } }),
  useBlocker: () => router.resolver,
}));

function Harness() {
  useUnsavedChangesGuard(true);
  return null;
}

function form() {
  return <ConfirmProvider><Harness /></ConfirmProvider>;
}

function blockedAttempt() {
  const resolver = { status: "blocked" as const, proceed: vi.fn(), reset: vi.fn() };
  router.resolver = resolver;
  return resolver;
}

beforeEach(() => {
  router.resolver = { status: "idle" };
});

it("prompts again after cancel when a different blocked resolver renders without an idle state", async () => {
  const { rerender } = render(form());
  const first = blockedAttempt();
  rerender(form());
  fireEvent.click(await screen.findByRole("button", { name: "Seguir editando" }));
  await waitFor(() => expect(first.reset).toHaveBeenCalledOnce());

  // TanStack can replace the attempt while the compat state still reads blocked.
  const second = blockedAttempt();
  rerender(form());
  await screen.findByRole("button", { name: "Descartar" });
  rerender(form());
  expect(screen.getAllByRole("button", { name: "Descartar" })).toHaveLength(1);
  expect(second.reset).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
  await waitFor(() => expect(second.proceed).toHaveBeenCalledOnce());
  expect(first.proceed).not.toHaveBeenCalled();
});

it("cancels only the previous resolver when a new attempt supersedes an open prompt", async () => {
  const { rerender } = render(form());
  const first = blockedAttempt();
  rerender(form());
  await screen.findByRole("button", { name: "Descartar" });

  const second = blockedAttempt();
  rerender(form());
  await waitFor(() => expect(first.reset).toHaveBeenCalledOnce());
  expect(second.reset).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
  await waitFor(() => expect(second.proceed).toHaveBeenCalledOnce());
  expect(first.proceed).not.toHaveBeenCalled();
});
