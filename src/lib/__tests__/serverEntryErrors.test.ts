import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchHandler, captureServerError } = vi.hoisted(() => ({ fetchHandler: vi.fn(), captureServerError: vi.fn() }));
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: fetchHandler } }));
vi.mock("../observability/serverSentry.server", () => ({
  captureServerError,
  withServerSentry: (_request: Request, _env: unknown, _ctx: unknown, handler: () => Response | Promise<Response>) => handler(),
}));
import server from "@/server";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };
const swallowed = () => Response.json({ unhandled: true, message: "HTTPError" }, { status: 500 });
beforeEach(() => { fetchHandler.mockReset(); captureServerError.mockReset(); });

describe("entrada SSR: mantiene respuesta e identidad del error", () => {
  it("recupera los errores originales de dos respuestas h3 concurrentes", async () => {
    const bLogged = deferred(); const aNormalized = deferred();
    const errorA = new Error("request-a"); const errorB = new Error("request-b");
    fetchHandler.mockImplementation(async (request: Request) => {
      if (new URL(request.url).pathname === "/a") {
        console.error(errorA); await bLogged.promise; return swallowed();
      }
      console.error(errorB); bLogged.resolve(); await aNormalized.promise; return swallowed();
    });
    const a = server.fetch(new Request("https://liftgo.lovable.app/a"), {}, {});
    const b = server.fetch(new Request("https://liftgo.lovable.app/b"), {}, {});
    const responseA = await a; aNormalized.resolve(); const responseB = await b;
    expect(captureServerError.mock.calls.map(([error]) => error)).toEqual([errorA, errorB]);
    for (const response of [responseA, responseB]) {
      expect(response.status).toBe(500); expect(response.headers.get("content-type")).toContain("text/html");
      const body = await response.text(); expect(body).not.toContain("request-a"); expect(body).not.toContain("request-b");
    }
  });

  it("conserva una respuesta JSON de negocio y sus cabeceras", async () => {
    const response = Response.json({ code: "unavailable" }, { status: 503, headers: { "retry-after": "10" } });
    fetchHandler.mockResolvedValue(response);
    const result = await server.fetch(new Request("https://liftgo.lovable.app/"), {}, {});
    expect(result).toBe(response); expect(result.headers.get("retry-after")).toBe("10");
    expect(await result.json()).toEqual({ code: "unavailable" }); expect(captureServerError).not.toHaveBeenCalled();
  });

  it("captura una excepción que escapa y oculta sus detalles al visitante", async () => {
    const error = new Error("private-stack-message"); fetchHandler.mockRejectedValue(error);
    const response = await server.fetch(new Request("https://liftgo.lovable.app/"), {}, {});
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("private-stack-message");
    expect(captureServerError).toHaveBeenCalledExactlyOnceWith(error);
  });
});
