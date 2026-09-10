import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { useUserManualMock } = vi.hoisted(() => ({
  useUserManualMock: vi.fn(),
}));

vi.mock("../hooks/useUserManual", () => ({
  useUserManual: useUserManualMock,
}));

vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: "customer" }),
}));

import HelpPage from "./HelpPage";

describe("HelpPage version feedback", () => {
  it("muestra el error de versiones y expone un reintento", () => {
    const refetchVersions = vi.fn();
    useUserManualMock.mockReturnValue({
      manual: {
        id: "manual-1",
        version: "2.0",
        generated_at: "2026-09-09T12:00:00Z",
        content: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      generate: vi.fn(),
      isGenerating: false,
      versions: [],
      versionsIsLoading: false,
      versionsIsError: true,
      refetchVersions,
      selectedVersion: null,
      setSelectedVersion: vi.fn(),
    });

    render(<HelpPage />);

    expect(screen.getByText("No se pudo cargar las versiones del manual")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/i }));
    expect(refetchVersions).toHaveBeenCalledTimes(1);
  });
});

