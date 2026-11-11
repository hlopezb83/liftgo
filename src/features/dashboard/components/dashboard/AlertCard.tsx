import { type LucideIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/lib/router-compat-ui";
import { cn } from "@/lib/utils";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

interface AlertCardProps {
  icon: LucideIcon;
  title: string;
  count: number;
  tone: "destructive" | "warning" | "maintenance";
  children: ReactNode;
  footer?: ReactNode;
}

const TONE: Record<AlertCardProps["tone"], { card: string; title: string }> = {
  destructive: { card: "border-destructive/30 bg-destructive/5", title: "text-destructive" },
  warning: { card: "border-warning/30 bg-warning/5", title: "text-warning-text" },
  maintenance: { card: "border-status-maintenance/30 bg-status-maintenance/5", title: "text-status-maintenance" },
};

export function AlertCard({ icon: Icon, title, count, tone, children, footer }: AlertCardProps) {
  const t = TONE[tone];
  const titleId = `alert-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <Card className={t.card} role="region" aria-labelledby={titleId}>
      <CardHeader className="pb-2">
        <CardTitle id={titleId} className={cn("text-base flex items-center gap-2", t.title)}>
          <Icon className="h-4 w-4" aria-hidden="true" /> {title} ({count})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {children}
        {footer}
      </CardContent>
    </Card>
  );
}

interface AlertRowProps {
  primary: string;
  secondary?: string | null;
  rightTop: ReactNode;
  rightBottom?: ReactNode;
  to: string;
  action?: { icon: LucideIcon; title: string; onClick: (e: ReactMouseEvent) => void; className?: string };
}

export function AlertRow({ primary, secondary, rightTop, rightBottom, to, action }: AlertRowProps) {
  const ActionIcon = action?.icon;
  return (
    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-background/80 text-sm">
      <Link to={to} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="min-w-0 flex-1 pr-2">
          <div className="font-medium truncate">{primary}</div>
          {secondary && <div className="text-muted-foreground text-xs truncate">{secondary}</div>}
        </div>
        <div className="text-right leading-tight">
          {rightTop}
          {rightBottom && <p className="text-2xs text-muted-foreground">{rightBottom}</p>}
        </div>
      </Link>
      {action && ActionIcon && (
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={action.onClick} title={action.title} aria-label={action.title}>
          <ActionIcon className={cn("h-4 w-4", action.className)} aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
