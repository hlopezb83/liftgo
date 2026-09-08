import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  normalizeSearchStr,
  useLocation,
  useNavigate,
  useSearchParams,
} from "@/lib/router-compat";
import { createRouterWrapper } from "@/test/router";

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
