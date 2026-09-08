import type { ComponentProps, Ref } from "react";
import { Link, useLocation } from "@/lib/router-compat";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<ComponentProps<typeof Link>, "className"> {
  className?: string;
  activeClassName?: string;
  /** Conservado por compatibilidad de llamada; TanStack no expone isPending aquí. */
  pendingClassName?: string;
  /** react-router: activo sólo en match exacto (sin subrutas). */
  end?: boolean;
  ref?: Ref<HTMLAnchorElement>;
}

const NavLink = ({
  className,
  activeClassName,
  pendingClassName: _pendingClassName,
  end,
  to,
  ref,
  ...props
}: NavLinkCompatProps) => {
  const { pathname } = useLocation();
  const path = to.split(/[?#]/)[0] || "/";
  const isActive =
    path === "/" || end ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  return (
    <Link
      ref={ref}
      to={to}
      className={cn(
        "transition-all duration-150",
        className,
        isActive && "border-l-2 border-primary pl-1",
        isActive && activeClassName,
      )}
      {...props}
    />
  );
};

NavLink.displayName = "NavLink";

export { NavLink };
