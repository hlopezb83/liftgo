/**
 * Router-compat shim — bridges react-router-dom v6 call sites to
 * @tanstack/react-router without hand-rewriting every component.
 * This is the same load-bearing pattern used in Klar's dev-copy migration.
 */
import {
  useNavigate as tsNavigate,
  useLocation as tsLocation,
  useParams as tsParams,
  useRouter,
  useBlocker as tsUseBlocker,
  Link as TSLink,
  Navigate as TSNavigate,
  Outlet as TSOutlet,
} from "@tanstack/react-router";
import { useMemo, useCallback, useEffect, useState, forwardRef, type ComponentProps, type ReactNode } from "react";

// ---------- shared URL parsing ----------

function parseTo(to: string): { pathname: string; search?: Record<string, string>; hash?: string } {
  const [beforeHash, hashStr] = (to ?? "").split("#");
  const [pathname, searchStr] = beforeHash.split("?");
  return {
    // react-router keeps the current path for search-only ("?a=1") and
    // hash-only ("#section") targets; TanStack's "." means current route.
    pathname: pathname || ".",
    search: searchStr ? Object.fromEntries(new URLSearchParams(searchStr)) : undefined,
    hash: hashStr || undefined,
  };
}

// ---------- useNavigate ----------

type NavigateOptions = { replace?: boolean; state?: unknown };

type PartialPath = { pathname?: string; search?: string; hash?: string };

type NavigateFn = {
  (to: string | PartialPath | number, options?: NavigateOptions): void;
  (delta: number): void;
};

export function useNavigate(): NavigateFn {
  const tsNav = tsNavigate();
  const router = useRouter();
  return useCallback((to: string | PartialPath | number, options?: NavigateOptions) => {
    if (typeof to === "number") {
      router.history.go(to);
      return;
    }
    const str =
      typeof to === "string"
        ? to
        : `${to.pathname ?? "."}${to.search ? (to.search.startsWith("?") ? to.search : `?${to.search}`) : ""}${to.hash ? (to.hash.startsWith("#") ? to.hash : `#${to.hash}`) : ""}`;
    const { pathname, search, hash } = parseTo(str);
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
  return useMemo(
    () => ({
      pathname: loc.pathname,
      search: loc.searchStr ? `?${loc.searchStr}` : "",
      hash: loc.hash ?? "",
      state: (loc.state ?? null) as unknown,
      key: loc.pathname + (loc.searchStr ?? ""),
    }),
    [loc.pathname, loc.searchStr, loc.hash, loc.state],
  );
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

// ---------- Link ----------

type LinkProps = Omit<ComponentProps<typeof TSLink>, "to"> & {
  to: string;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, state, children, ...rest },
  ref,
) {
  const { pathname, search, hash } = parseTo(to);
  return (
    <TSLink
      ref={ref as never}
      to={pathname as never}
      search={search as never}
      hash={hash}
      replace={replace}
      state={state as never}
      {...((rest ?? {}) as Record<string, unknown>)}
    >
      {children}
    </TSLink>
  );
});


// ---------- Navigate ----------

export function Navigate({ to, replace, state }: { to: string; replace?: boolean; state?: unknown }) {
  const { pathname, search, hash } = parseTo(to);
  return <TSNavigate to={pathname as never} search={search as never} hash={hash} state={state as never} replace={replace} />;
}

// ---------- Outlet ----------

export const Outlet = TSOutlet;

// ---------- NavLink (minimal) ----------

export const NavLink = Link;

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
  return {
    state: blocker.status === "blocked" ? "blocked" : "unblocked",
    proceed: blocker.proceed,
    reset: blocker.reset,
  };
}
