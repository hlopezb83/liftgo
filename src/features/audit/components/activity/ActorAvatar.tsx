import { ROLE_COLORS, ROLE_LABELS } from "@/lib/constants";
import type { AppRole } from "@/features/users";
import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-[hsl(var(--chart-1))]", "bg-[hsl(var(--chart-2))]", "bg-[hsl(var(--chart-3))]",
  "bg-[hsl(var(--chart-4))]", "bg-[hsl(var(--chart-5))]",
  "bg-info", "bg-success", "bg-warning",
];

function actorInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "·";
}

function actorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

interface Props {
  name: string;
  role: AppRole | null;
  size?: "sm" | "md";
  isSystem?: boolean;
}

export function ActorAvatar({ name, role, size = "md", isSystem }: Props) {
  const sizeCls = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  const colorCls = isSystem ? "bg-muted-foreground" : actorColor(name);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={cn("rounded-full flex items-center justify-center font-semibold text-white shrink-0", sizeCls, colorCls)}>
        {actorInitials(name)}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate leading-tight">{name}</p>
        {role && (
          <span className={cn("inline-block text-[10px] px-1.5 py-0 rounded leading-tight", ROLE_COLORS[role])}>
            {ROLE_LABELS[role]}
          </span>
        )}
        {!role && isSystem && (
          <span className="inline-block text-[10px] px-1.5 py-0 rounded leading-tight bg-muted text-muted-foreground">
            Automático
          </span>
        )}
      </div>
    </div>
  );
}
