import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyWithFeedback } from "../copyWithFeedback";

const feedback = vi.hoisted(() => ({ warning: vi.fn(), success: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: feedback }));
vi.mock("@/lib/observability/captureOperationalError", () => ({ captureOperationalError: vi.fn() }));
vi.mock("@/lib/ui/errorDetailsStore", () => ({ openErrorReport: vi.fn() }));
const writeText = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

describe("copyWithFeedback", () => {
  it("confirma éxito sólo cuando la copia termina", async () => {
    let finish!: () => void;
    writeText.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const copying = copyWithFeedback("un valor", "RFC");
    expect(feedback.success).not.toHaveBeenCalled();
    finish();
    await expect(copying).resolves.toBe(true);
    expect(feedback.success).toHaveBeenCalledWith("RFC copiado", expect.anything());
  });

  it("conserva la causa, permite copiar JSON y no incluye el enlace", async () => {
    const link = "https://example.com/recovery#access_token=synthetic-one-use-token";
    const cause = new DOMException("Clipboard permission denied", "NotAllowedError");
    writeText.mockRejectedValueOnce(cause);
    await expect(copyWithFeedback(link, "Enlace")).resolves.toBe(false);
    expect(feedback.success).not.toHaveBeenCalled();
    const [title, options] = feedback.warning.mock.calls[0];
    expect(title).toBe("No se pudo copiar enlace");
    expect(options.duration).toBe(6000);
    expect(options.action.props.report).toMatchObject({
      phase: "clipboard", method: "writeText",
      errorDetails: { name: "NotAllowedError", message: cause.message },
    });
    render(options.action);
    fireEvent.click(screen.getByRole("button", { name: "Copiar JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    const json = writeText.mock.calls[1][0];
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json).not.toContain(link);
    expect(json).not.toContain("synthetic-one-use-token");
    expect(screen.getByRole("button", { name: "Ver detalles" })).toBeInTheDocument();
    expect(options.description).toContain("manualmente");
  });

  it("maneja un portapapeles no disponible", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    await expect(copyWithFeedback("un valor", "Mensaje")).resolves.toBe(false);
    expect(feedback.warning).toHaveBeenCalledOnce();
    expect(feedback.success).not.toHaveBeenCalled();
  });
});
