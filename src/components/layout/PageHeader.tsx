import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BackIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** @deprecated use `actions` */
  action?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}

export function PageHeader({ title, subtitle, action, actions, backHref, backLabel }: PageHeaderProps) {
  const right = actions ?? action;
  return (
    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
      <div className="min-w-0 lg:flex-1 space-y-1">
        {backHref && (
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-muted-foreground hover:text-foreground">
            <Link to={backHref}>
              <BackIcon className="h-3.5 w-3.5 mr-1" />
              {backLabel ?? "Volver"}
            </Link>
          </Button>
        )}
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight line-clamp-2">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-xs sm:text-sm">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0 flex flex-wrap gap-2">{right}</div>}
    </div>
  );
}
