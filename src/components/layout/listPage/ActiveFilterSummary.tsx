import { useLayoutEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Remains visible when the mobile filter panel is closed. */
export function ActiveFilterSummary({ labels, onClear, onCleared }: { labels?: string[]; onClear?: () => void; onCleared?: () => void }) {
  const clearTrigger = useRef<{ element: HTMLButtonElement; labelsKey: string } | null>(null);
  useLayoutEffect(() => {
    const request = clearTrigger.current;
    if (!request || (request.element.isConnected && request.labelsKey === JSON.stringify(labels ?? []))) return;
    const trigger = request.element;
    clearTrigger.current = null;
    if (trigger.isConnected) return;
    // Wait for the chips to disappear, but preserve a destination the user
    // already focused while an asynchronous filter reset was pending.
    const active = document.activeElement;
    if (active === document.body || active === trigger || !active?.isConnected) onCleared?.();
  }, [labels, onCleared]);
  if (!labels?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ul aria-label="Filtros activos" className="flex min-w-0 flex-wrap gap-2">
        {labels.map((label) => <li key={label} className="min-w-0 max-w-full">
          <Badge variant="secondary" className="max-w-full whitespace-normal [overflow-wrap:anywhere]">{label}</Badge>
        </li>)}
      </ul>
      {onClear && <Button type="button" variant="ghost" size="sm" onClick={(event) => { clearTrigger.current = { element: event.currentTarget, labelsKey: JSON.stringify(labels ?? []) }; onClear(); }}>Limpiar filtros activos</Button>}
    </div>
  );
}
