import { RefreshIcon, SpinnerIcon } from "@/components/icons";

interface Props {
  visible: boolean;
  pullDistance: number;
  isRefreshing: boolean;
  ready: boolean;
}

export function PullToRefreshIndicator({ visible, pullDistance, isRefreshing, ready }: Props) {
  if (!visible) return null;
  return (
    <div
      className="flex items-center justify-center text-xs text-muted-foreground -mt-2 -mb-2"
      style={{ height: Math.max(24, pullDistance), transition: isRefreshing ? "height 200ms ease" : undefined }}
      aria-live="polite"
    >
      {isRefreshing ? (
        <span className="flex items-center gap-2"><SpinnerIcon className="h-4 w-4 animate-spin" />Actualizando…</span>
      ) : (
        <span className="flex items-center gap-2">
          <RefreshIcon className={`h-4 w-4 transition-transform ${ready ? "rotate-180" : ""}`} />
          {ready ? "Suelta para actualizar" : "Desliza para actualizar"}
        </span>
      )}
    </div>
  );
}
