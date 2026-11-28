import { describe, it, expect, vi } from "vitest";
import { exportToCsv } from "@/lib/exportCsv";

interface MockLink { href: string; download: string; click: ReturnType<typeof vi.fn> }

describe("exportToCsv", () => {
  it("does nothing for empty rows", () => {
    const spy = vi.spyOn(document, "createElement");
    exportToCsv("test.csv", []);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("generates correct CSV content", () => {
    const mockLink: MockLink = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    exportToCsv("test.csv", [
      { Name: "Alice", Age: 30 },
      { Name: "Bob", Age: 25 },
    ]);

    expect(mockLink.download).toBe("test.csv");
    expect(mockLink.click).toHaveBeenCalled();
  });

  it("escapes commas and quotes in values", () => {
    const mockLink: MockLink = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    exportToCsv("test.csv", [{ Note: 'He said "hello, world"' }]);
    expect(mockLink.click).toHaveBeenCalled();
  });
});
