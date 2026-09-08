/**
 * Componentes del shim de navegación (react-router → @tanstack/react-router).
 * Viven aparte de los hooks para que este archivo exporte sólo componentes
 * (requisito de Fast Refresh).
 */
import { Link as TSLink, Navigate as TSNavigate, Outlet as TSOutlet } from "@tanstack/react-router";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { parseTo } from "./router-compat-url";

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

export function Navigate({ to, replace, state }: { to: string; replace?: boolean; state?: unknown }) {
  const { pathname, search, hash } = parseTo(to);
  return <TSNavigate to={pathname as never} search={search as never} hash={hash} state={state as never} replace={replace} />;
}

export const Outlet = TSOutlet;
