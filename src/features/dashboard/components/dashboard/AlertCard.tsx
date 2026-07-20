import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { type LucideIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  warning: { card: "border-warning/30 bg-warning/5", title: "text-warning" },
  maintenance: { card: "border-status-maintenance/30 bg-status-maintenance/5", title: "text-status-maintenance" },
};

export function AlertCard({ icon: Icon, title, count, tone, children, footer }: AlertCardProps) {
  const t = TONE[tone];
  return (
    <Card className={t.card}>
      <CardHeader className="pb-2">
        <CardTitle className={cn("text-base flex items-center gap-2", t.title)}>
          <Icon className="h-4 w-4" /> {title} ({count})
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
  onClick: () => void;
  action?: { icon: LucideIcon; title: string; onClick: (e: ReactMouseEvent) => void; className?: string };
}

export function AlertRow({ primary, secondary, rightTop, rightBottom, onClick, action }: AlertRowProps) {
  const ActionIcon = action?.icon;
  return (
    <div
      className="flex items-center justify-between p-2 rounded-lg bg-background/80 text-sm cursor-pointer hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
    >
      <div className="min-w-0 flex-1 pr-2">
        <div className="font-medium truncate">{primary}</div>
        {secondary && <div className="text-muted-foreground text-xs truncate">{secondary}</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="text-right leading-tight">
          {rightTop}
          {rightBottom && <p className="text-2xs text-muted-foreground">{rightBottom}</p>}
        </div>
        {action && ActionIcon && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={action.onClick} title={action.title} aria-label={action.title}>
            <ActionIcon className={cn("h-4 w-4", action.className)} />
          </Button>
        )}
      </div>
    </div>
  );
}
