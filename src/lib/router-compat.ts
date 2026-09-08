/**
 * Router-compat shim — bridges react-router-dom v6 call sites to
 * @tanstack/react-router without hand-rewriting every component.
 * Sólo hooks: los componentes (Link/Navigate/Outlet) viven en
 * `router-compat-ui.tsx` para no romper Fast Refresh.
 */
import {
  useNavigate as tsNavigate,
  useLocation as tsLocation,
  useParams as tsParams,
  useRouter,
  useBlocker as tsUseBlocker,
} from "@tanstack/react-router";
import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { normalizeSearchStr, parseTo } from "./router-compat-url";

export { normalizeSearchStr } from "./router-compat-url";

// ---------- useNavigate ----------

type NavigateOptions = { replace?: boolean; state?: unknown };

type PartialPath = { pathname?: string; search?: string; hash?: string };

type NavigateFn = {
  (to: string | PartialPath | number, options?: NavigateOptions): void;
  (delta: number): void;
};

function toPathString(to: string | PartialPath): string {
  if (typeof to === "string") return to;
  const search = to.search ? (to.search.startsWith("?") ? to.search : `?${to.search}`) : "";
  const hash = to.hash ? (to.hash.startsWith("#") ? to.hash : `#${to.hash}`) : "";
  return `${to.pathname ?? "."}${search}${hash}`;
}

export function useNavigate(): NavigateFn {
  const tsNav = tsNavigate();
  const router = useRouter();
  return useCallback((to: string | PartialPath | number, options?: NavigateOptions) => {
    if (typeof to === "number") {
      router.history.go(to);
      return;
    }
    const { pathname, search, hash } = parseTo(toPathString(to));
    tsNav({
      to: pathname,
      search: search as never,
      hash,
      state: options?.state as never,
      replace: options?.replace,
    });
  }, [tsNav, router]) as NavigateFn;
}

// ---------- useLocation ----------

export function useLocation() {
  const loc = tsLocation();
  return useMemo(() => {
    const search = normalizeSearchStr(loc.searchStr);
    const hash = loc.hash ? (loc.hash.startsWith("#") ? loc.hash : `#${loc.hash}`) : "";
    // TS-04: cada entrada del historial tiene su identidad nativa. Derivar la
    // clave de pathname+search+hash hacía que dos visitas distintas a la misma
    // URL compartieran posición de scroll.
    const st = (loc.state ?? {}) as { __TSR_key?: string; key?: string };
    const key = st.__TSR_key ?? st.key ?? loc.pathname + search + hash;
    return {
      pathname: loc.pathname,
      search,
      hash,
      state: (loc.state ?? null) as unknown,
      key,
    };
  }, [loc.pathname, loc.searchStr, loc.hash, loc.state]);
}

// ---------- useParams ----------

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return tsParams({ strict: false } as never) as T;
}

// ---------- useSearchParams (react-router-dom compat) ----------

export function useSearchParams(): [URLSearchParams, (init: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams), opts?: { replace?: boolean }) => void] {
  const loc = tsLocation();
  const nav = tsNavigate();
  const router = useRouter();
  const params = useMemo(() => new URLSearchParams(loc.searchStr ?? ""), [loc.searchStr]);
  const setParams = useCallback(
    (
      init: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams),
      opts?: { replace?: boolean },
    ) => {
      // Functional updaters read the router's live location, not the render
      // snapshot — react-router passes call-time params, and chained updates
      // within one tick must see each other's writes.
      const live = router.state.location;
      const current = new URLSearchParams(live.searchStr ?? "");
      const next =
        typeof init === "function"
          ? init(current)
          : init instanceof URLSearchParams
            ? init
            : new URLSearchParams(init);
      const searchObj: Record<string, string> = {};
      next.forEach((v, k) => { searchObj[k] = v; });
      nav({ to: live.pathname, search: searchObj as never, replace: opts?.replace });
    },
    [nav, router],
  );
  return [params, setParams];
}

// ---------- useNavigationType (react-router compat) ----------

export type NavigationType = "POP" | "PUSH" | "REPLACE";

export function useNavigationType(): NavigationType {
  const router = useRouter();
  const [navType, setNavType] = useState<NavigationType>("POP");
  useEffect(() => {
    return router.history.subscribe((event) => {
      const t = (event as { action?: { type?: string } }).action?.type;
      if (t === "PUSH" || t === "REPLACE") setNavType(t);
      else setNavType("POP");
    });
  }, [router]);
  return navType;
}

// ---------- useBlocker (react-router v7 compat) ----------

type BlockerFnArgs = {
  currentLocation: { pathname: string };
  nextLocation: { pathname: string };
};

export function useBlocker(shouldBlock: boolean | ((args: BlockerFnArgs) => boolean)): {
  state: "blocked" | "unblocked";
  proceed?: () => void;
  reset?: () => void;
} {
  const blocker = tsUseBlocker({
    shouldBlockFn: ({ current, next }) => {
      if (typeof shouldBlock === "function") {
        return shouldBlock({
          currentLocation: { pathname: current.pathname },
          nextLocation: { pathname: next.pathname },
        });
      }
      return shouldBlock;
    },
    withResolver: true,
    enableBeforeUnload: false,
  });
  // TS-03: identidad estable. Antes se devolvía un objeto nuevo en cada
  // render y el efecto consumidor volvía a pedir confirmación, cancelando el
  // intento de navegación original.
  const latest = useRef(blocker);
  useEffect(() => {
    latest.current = blocker;
  });
  const proceed = useCallback(() => latest.current.proceed?.(), []);
  const reset = useCallback(() => latest.current.reset?.(), []);
  const state: "blocked" | "unblocked" = blocker.status === "blocked" ? "blocked" : "unblocked";
  return useMemo(() => ({ state, proceed, reset }), [state, proceed, reset]);
}
