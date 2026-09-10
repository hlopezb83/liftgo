import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { normalizeSearchStr, useLocation, useNavigate, useSearchParams } from "@/lib/router-compat";
import { createRouterWrapper } from "@/test/routerWrapper";

describe("normalizeSearchStr", () => {
  it("devuelve cadena vacía sin query", () => {
    expect(normalizeSearchStr(undefined)).toBe("");
    expect(normalizeSearchStr("")).toBe("");
    expect(normalizeSearchStr("?")).toBe("");
  });

  it("conserva exactamente un '?' aunque la entrada ya lo traiga", () => {
    expect(normalizeSearchStr("?status=overdue")).toBe("?status=overdue");
    expect(normalizeSearchStr("status=overdue")).toBe("?status=overdue");
    expect(normalizeSearchStr("??status=overdue")).toBe("?status=overdue");
  });
});

describe("useLocation (compat react-router)", () => {
  it("sin query: search vacío", async () => {
    const { result } = renderHook(() => useLocation(), {
      wrapper: createRouterWrapper(["/invoices"]),
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.pathname).toBe("/invoices");
    expect(result.current.search).toBe("");
    expect(new URLSearchParams(result.current.search).get("status")).toBeNull();
  });

  it("con un parámetro: search legible por URLSearchParams", async () => {
    const { result } = renderHook(() => useLocation(), {
      wrapper: createRouterWrapper(["/invoices?status=overdue"]),
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.search).toBe("?status=overdue");
    expect(new URLSearchParams(result.current.search).get("status")).toBe("overdue");
  });

  it("con varios parámetros: todos legibles", async () => {
    const { result } = renderHook(() => useLocation(), {
      wrapper: createRouterWrapper(["/invoices?status=overdue&customer=abc"]),
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    const params = new URLSearchParams(result.current.search);
    expect(result.current.search.startsWith("??")).toBe(false);
    expect(params.get("status")).toBe("overdue");
    expect(params.get("customer")).toBe("abc");
  });
});

describe("useSearchParams (compat react-router)", () => {
  it("lee los parámetros de la URL inicial", async () => {
    const { result } = renderHook(() => useSearchParams(), {
      wrapper: createRouterWrapper(["/invoices?status=overdue&page=2"]),
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current[0].get("status")).toBe("overdue");
    expect(result.current[0].get("page")).toBe("2");
  });

  it("mantiene los parámetros al navegar atrás y adelante", async () => {
    const { result } = renderHook(
      () => ({ location: useLocation(), navigate: useNavigate() }),
      { wrapper: createRouterWrapper(["/invoices?status=overdue"]) },
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.location.search).toBe("?status=overdue");

    await act(async () => {
      result.current.navigate("/invoices?status=paid");
    });
    expect(new URLSearchParams(result.current.location.search).get("status")).toBe("paid");

    await act(async () => {
      result.current.navigate(-1);
    });
    expect(new URLSearchParams(result.current.location.search).get("status")).toBe("overdue");

    await act(async () => {
      result.current.navigate(1);
    });
    expect(new URLSearchParams(result.current.location.search).get("status")).toBe("paid");
  });
});

describe("TS-02: query strings compatibles con URLSearchParams", () => {
  const cases: Array<[string, string, string, string]> = [
    ["/customers?new=1", "new", "1", "alta rápida de cliente"],
    ["/customers?from_prospect=true", "from_prospect", "true", "conversión desde CRM"],
    ["/returns?booking_id=bk-1&early=1", "early", "1", "devolución anticipada"],
    ["/invoices?q=123", "q", "123", "búsqueda numérica de texto"],
  ];

  it.each(cases)("navigate(%s) conserva %s sin comillas (%s)", async (to, key, value) => {
    const { result } = renderHook(
      () => ({ location: useLocation(), navigate: useNavigate() }),
      { wrapper: createRouterWrapper(["/"]) },
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    await act(async () => {
      result.current.navigate(to);
    });
    expect(result.current.location.search).not.toContain("%22");
    expect(new URLSearchParams(result.current.location.search).get(key)).toBe(value);
  });

  it("conserva los demás filtros al escribir con el setter", async () => {
    const { result } = renderHook(
      () => ({ location: useLocation(), params: useSearchParams() }),
      { wrapper: createRouterWrapper(["/invoices?status=overdue&q=123"]) },
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    await act(async () => {
      result.current.params[1]((prev) => {
        prev.set("page", "2");
        return prev;
      });
    });
    const read = new URLSearchParams(result.current.location.search);
    expect(read.get("status")).toBe("overdue");
    expect(read.get("q")).toBe("123");
    expect(read.get("page")).toBe("2");
  });

  it("acepta valores vacíos y caracteres especiales", async () => {
    const { result } = renderHook(
      () => ({ location: useLocation(), navigate: useNavigate() }),
      { wrapper: createRouterWrapper(["/"]) },
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    await act(async () => {
      result.current.navigate("/invoices?q=" + encodeURIComponent("a&b ñ") + "&empty=");
    });
    const read = new URLSearchParams(result.current.location.search);
    expect(read.get("q")).toBe("a&b ñ");
    expect(read.get("empty")).toBe("");
  });
});

describe("TS-04: identidad de cada entrada del historial", () => {
  it("dos visitas a la misma URL reciben claves distintas", async () => {
    const seen: string[] = [];
    const { result } = renderHook(
      () => ({ location: useLocation(), navigate: useNavigate() }),
      { wrapper: createRouterWrapper(["/invoices"]) },
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    seen.push(result.current.location.key);

    await act(async () => {
      result.current.navigate("/bookings");
    });
    await act(async () => {
      result.current.navigate("/invoices");
    });
    seen.push(result.current.location.key);

    expect(seen[0]).toBeTruthy();
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("volver atrás recupera la clave de la entrada original", async () => {
    const { result } = renderHook(
      () => ({ location: useLocation(), navigate: useNavigate() }),
      { wrapper: createRouterWrapper(["/invoices"]) },
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    const first = result.current.location.key;
    await act(async () => {
      result.current.navigate("/bookings");
    });
    await act(async () => {
      result.current.navigate(-1);
    });
    expect(result.current.location.pathname).toBe("/invoices");
    expect(result.current.location.key).toBe(first);
  });
});
