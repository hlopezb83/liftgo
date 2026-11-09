import { afterEach, describe, expect, it, vi } from "vitest";
import { brokeredPreviewStorage } from "../previewAuthStorage";

const PROJECT = "e25ace4a-172e-4082-a037-00473dacf2f2";
function surface(host: string, framed = true, ancestor = "https://lovable.dev") {
  const values = new Map<string, string>();
  const local = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
  const listeners = new Set<(event: unknown) => void>();
  const parent = { postMessage: vi.fn() };
  const win = {
    parent: parent as unknown,
    addEventListener: vi.fn((_type: string, listener: (event: unknown) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: (event: unknown) => void) => listeners.delete(listener)),
  };
  if (!framed) win.parent = win;
  vi.stubGlobal("window", win);
  vi.stubGlobal("location", { hostname: host, ancestorOrigins: [ancestor] });
  vi.stubGlobal("document", { referrer: "" });
  vi.stubGlobal("localStorage", local);
  return { local, parent, reply: (data: unknown, origin = ancestor) => {
    for (const listener of listeners) listener({ data, origin });
  } };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("published preview auth storage boundary", () => {
  it.each([
    "liftgo.lovable.app",
    `live--${PROJECT}.lovable.app`,
    `live--${PROJECT}-thr_abc123.lovable.app`,
    `preview--name-${PROJECT}.lovable.app`,
    `id-preview--${PROJECT}.lovable.app.evil.example`,
    `id-preview--${PROJECT}extra.lovable.app`,
    "id-preview--00000000-0000-0000-0000-000000000000.lovable.app",
    "id-preview--e25ace4a-172e-7082-a037-00473dacf2f2.lovable.app",
    "id-preview--e25ace4a-172e-4082-0037-00473dacf2f2.lovable.app",
  ])("keeps local storage without broker calls on %s", (host) => {
    const { local, parent } = surface(host);
    expect(brokeredPreviewStorage()).toBe(local);
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it.each([
    `id-preview--${PROJECT}.lovable.app`,
    `id-preview-abc--${PROJECT}-dev.lovableproject-dev.com`,
    `project--${PROJECT}.lovableproject.com`,
    `${PROJECT}.lovableproject.com`,
  ])("preserves existing broker selection on %s", (host) => {
    const { local } = surface(host);
    expect(brokeredPreviewStorage()).not.toBe(local);
  });

  it("keeps standalone previews local", () => {
    const { local } = surface(`id-preview--${PROJECT}.lovable.app`, false);
    expect(brokeredPreviewStorage()).toBe(local);
  });

  it("is safe during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(brokeredPreviewStorage()).toBeUndefined();
  });

  it("preserves trusted-origin replies and logout tombstones", async () => {
    const { local, parent, reply } = surface(`id-preview--${PROJECT}.lovable.app`);
    local.setItem("synthetic-session", "synthetic-value");
    const storage = brokeredPreviewStorage()!;
    const result = storage.getItem("synthetic-session");
    const [request, origin] = parent.postMessage.mock.calls[0];
    expect(origin).toBe("https://lovable.dev");
    expect(request).toMatchObject({ projectId: PROJECT, type: "lovable-preview-auth:get" });
    reply({ type: "lovable-preview-auth:result", requestId: request.requestId, ok: true, value: "untrusted" }, "https://evil.example");
    expect(local.getItem("synthetic-session")).toBe("synthetic-value");
    reply({ type: "lovable-preview-auth:result", requestId: request.requestId, ok: true, value: "" });
    expect(await result).toBeNull();
    expect(local.getItem("synthetic-session")).toBeNull();
  });

  it("falls back locally after the existing bounded broker retry", async () => {
    vi.useFakeTimers();
    const { local, parent } = surface(`id-preview--${PROJECT}.lovable.app`);
    local.setItem("synthetic-session", "synthetic-value");
    const result = brokeredPreviewStorage()!.getItem("synthetic-session");
    await vi.advanceTimersByTimeAsync(4250);
    expect(await result).toBe("synthetic-value");
    expect(parent.postMessage).toHaveBeenCalledTimes(2);
  });
});
