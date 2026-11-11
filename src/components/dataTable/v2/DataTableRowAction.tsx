import { ViewIcon } from "@/components/icons";
import { Link } from "@/lib/router-compat-ui";
import type { TableRowAction } from "./types";
import type { ReactNode } from "react";

export function DataTableRowAction<T>({ item, columnId, action, onActivate, children }: {
  item: T;
  columnId: string;
  action?: TableRowAction<T>;
  onActivate?: (item: T) => void;
  children: ReactNode;
}) {
  if (!action || action.columnId !== columnId) return children;
  const label = action.label(item);
  const focusClass = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  if (action.to) {
    return <Link to={action.to(item)} state={action.state?.(item)} aria-label={label}
      data-table-row-action className={`${focusClass} text-primary underline-offset-4 hover:underline`}>{children}</Link>;
  }
  if (!onActivate) return children;
  return <div className="flex items-center gap-2">
    {children}
    <button type="button" data-table-row-action aria-label={label} title={label}
      onClick={() => onActivate(item)}
      className={`${focusClass} inline-flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground`}>
      <ViewIcon className="h-4 w-4" aria-hidden="true" />
    </button>
  </div>;
}
