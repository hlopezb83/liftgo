import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TS-01 (transporte real): ejecuta la cadena de middleware GLOBAL de Start
 * (la registrada en `src/start.ts`) más el serializador HTTP real de
 * `createServerFn`, interceptando `fetch` y entregando la petición al
 * receptor real `requireSupabaseAuth`. Nunca toca el backend.
 *
 * Falla si el middleware deja de registrarse globalmente o si el encabezado
 * Authorization no llega al receptor.
 */

process.env["TSS_SERVER_FN_BASE"] = "/_serverFn/";

const getSession = vi.fn();
const getClaims = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));

// El receptor lee la petición del contexto del servidor: la sustituimos por la
// petición HTTP real que produjo el cliente.
let interceptedRequest: Request | null = null;
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => interceptedRequest,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims: (t: string) => getClaims(t) } }),
}));

import { createServerFn } from "@tanstack/react-start";
import { createClientRpc } from "@tanstack/react-start/client-rpc";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { startInstance } from "@/start";

type ServerMw = (ctx: { next: (o?: unknown) => unknown }) => Promise<{ context: { userId: string } }>;

/** Lógica de negocio: sólo debe ejecutarse tras pasar el guard. */
const business = vi.fn(async () => ({ ok: true }));

let capturedUrl = "";
let capturedInit: RequestInit | undefined;

/** `fetch` interceptado: hace de servidor y corre el guard real. */
async function receive(url: string, init?: RequestInit): Promise<Response> {
  capturedUrl = url;
  capturedInit = init;
  interceptedRequest = new Request(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    headers: init?.headers as HeadersInit,
    body: (init?.body as BodyInit | undefined) ?? null,
  });

  const serverMw = (requireSupabaseAuth as unknown as { options: { server: ServerMw } }).options.server;
  try {
    const out = await serverMw({ next: (o?: unknown) => o as never });
    const result = await business();
    // El transporte espera la envoltura { result } / { error } del servidor.
    return new Response(JSON.stringify({ result: { ...result, userId: out.context.userId } }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
}

const callFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { note: string }) => data)
  .handler(createClientRpc("src_lib_test--transportFn") as never, business as never);

/** Invoca la server function con las opciones GLOBALES reales de Start. */
async function call(note: string, startOptions?: unknown) {
  const options = startOptions ?? (await startInstance.getOptions());
  return runWithStartContext({ startOptions: options } as never, () =>
    callFn({ data: { note } }),
  ) as Promise<{ ok?: boolean; userId?: string }>;
}

function authHeaderSentToReceiver(): string | null {
  return interceptedRequest?.headers.get("authorization") ?? null;
}

describe("TS-01 · transporte real de server functions", () => {
  beforeEach(() => {
    getSession.mockReset();
    getClaims.mockReset();
    business.mockClear();
    interceptedRequest = null;
    capturedUrl = "";
    capturedInit = undefined;
    vi.stubGlobal("fetch", receive);
  });

  it("entrega el Bearer de la sesión al receptor y ejecuta el negocio", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "a.b.c" } } });
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    const res = await call("hola");

    expect(authHeaderSentToReceiver()).toBe("Bearer a.b.c");
    expect(res.userId).toBe("user-1");
    expect(business).toHaveBeenCalledTimes(1);
  });

  it("usa el token actualizado en una llamada posterior", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    getSession.mockResolvedValueOnce({ data: { session: { access_token: "viejo.j.w" } } });
    await call("1");
    expect(authHeaderSentToReceiver()).toBe("Bearer viejo.j.w");

    getSession.mockResolvedValueOnce({ data: { session: { access_token: "nuevo.j.w" } } });
    await call("2");
    expect(authHeaderSentToReceiver()).toBe("Bearer nuevo.j.w");
  });

  it("sin sesión el receptor rechaza y el negocio no corre", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(call("x")).rejects.toThrow(/No authorization header provided/);
    expect(authHeaderSentToReceiver()).toBeNull();
    expect(business).not.toHaveBeenCalled();
  });

  it("con credenciales inválidas el receptor rechaza y el negocio no corre", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "a.b.c" } } });
    getClaims.mockResolvedValue({ data: null, error: new Error("bad") });

    await expect(call("x")).rejects.toThrow(/Invalid token/);
    expect(business).not.toHaveBeenCalled();
  });

  it("el token viaja sólo en el encabezado, nunca en URL ni en el cuerpo", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "secreto.j.w" } } });
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    await call("hola");

    expect(capturedUrl).not.toContain("secreto");
    expect(String(capturedInit?.body ?? "")).not.toContain("secreto");
    expect(await interceptedRequest!.clone().text()).not.toContain("secreto");
  });

  it("si el middleware global no está registrado, el Authorization no llega", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "a.b.c" } } });

    await expect(call("x", {})).rejects.toThrow(/No authorization header provided/);
  });
});
