import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontal } from "@/components/icons";

import { cn } from "@/lib/utils";
import { ButtonProps, buttonVariants } from "@/components/ui/button";

const Pagination = ({ className, ref, ...props }: React.ComponentProps<"nav"> & { ref?: React.Ref<HTMLElement> }) => {
  return (
    <nav
      ref={ref}
      role="navigation"
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
};
Pagination.displayName = "Pagination";

const PaginationContent = ({ className, ref, ...props }: React.ComponentProps<"ul"> & { ref?: React.Ref<HTMLUListElement> }) => {
  return (
    <ul ref={ref} className={cn("flex flex-row items-center gap-1", className)} {...props} />
  );
};
PaginationContent.displayName = "PaginationContent";

const PaginationItem = ({ className, ref, ...props }: React.ComponentProps<"li"> & { ref?: React.Ref<HTMLLIElement> }) => {
  return (
    <li ref={ref} className={cn("", className)} {...props} />
  );
};
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<ButtonProps, "size"> &
  React.ComponentProps<"a">;

const PaginationLink = ({ className, isActive, size = "icon", ref, ...props }: PaginationLinkProps & { ref?: React.Ref<HTMLAnchorElement> }) => {
  return (
    <a
      ref={ref}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        className,
      )}
      {...props}
    />
  );
};
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = ({ className, ref, ...props }: React.ComponentProps<typeof PaginationLink> & { ref?: React.Ref<HTMLAnchorElement> }) => {
  return (
    <PaginationLink ref={ref} aria-label="Ir a la página anterior" size="default" className={cn("gap-1 pl-2.5", className)} {...props}>
      <ChevronLeftIcon className="h-4 w-4" />
      <span>Anterior</span>
    </PaginationLink>
  );
};
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({ className, ref, ...props }: React.ComponentProps<typeof PaginationLink> & { ref?: React.Ref<HTMLAnchorElement> }) => {
  return (
    <PaginationLink ref={ref} aria-label="Ir a la página siguiente" size="default" className={cn("gap-1 pr-2.5", className)} {...props}>
      <span>Siguiente</span>
      <ChevronRightIcon className="h-4 w-4" />
    </PaginationLink>
  );
};
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span aria-hidden className={cn("flex h-9 w-9 items-center justify-center", className)} {...props}>
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">Más páginas</span>
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
