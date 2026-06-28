import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertCardProps {
  icon: LucideIcon;
  title: string;
  count: number;
  tone: "destructive" | "warning" | "maintenance";
  children: React.ReactNode;
  footer?: React.ReactNode;
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
  rightTop: React.ReactNode;
  rightBottom?: React.ReactNode;
  onClick: () => void;
  action?: { icon: LucideIcon; title: string; onClick: (e: React.MouseEvent) => void; className?: string };
}

export function AlertRow({ primary, secondary, rightTop, rightBottom, onClick, action }: AlertRowProps) {
  const ActionIcon = action?.icon;
  return (
    <div
      className="flex items-center justify-between p-2 rounded-lg bg-background/80 text-sm cursor-pointer hover:bg-background"
      onClick={onClick}
    >
      <div>
        <span className="font-medium">{primary}</span>
        {secondary && <span className="text-muted-foreground ml-2">{secondary}</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          {rightTop}
          {rightBottom && <p className="text-xs text-muted-foreground">{rightBottom}</p>}
        </div>
        {action && ActionIcon && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={action.onClick} title={action.title}>
            <ActionIcon className={cn("h-4 w-4", action.className)} />
          </Button>
        )}
      </div>
    </div>
  );
}
