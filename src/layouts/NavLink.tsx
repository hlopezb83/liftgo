import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import type { Ref } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
  ref?: Ref<HTMLAnchorElement>;
}

const NavLink = ({
  className,
  activeClassName,
  pendingClassName,
  to,
  ref,
  ...props
}: NavLinkCompatProps) => {
  return (
    <RouterNavLink
      ref={ref}
      to={to}
      className={({ isActive, isPending }) =>
        cn(
          "transition-all duration-150",
          className,
          isActive && "border-l-2 border-primary pl-1",
          isActive && activeClassName,
          isPending && pendingClassName,
        )
      }
      {...props}
    />
  );
};

NavLink.displayName = "NavLink";

export { NavLink };
