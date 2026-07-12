import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePageActionsContext } from "@/contexts/pageActions";
import { GLOBAL_SHORTCUTS, NAV_SHORTCUTS, PAGE_SHORTCUTS } from "@/lib/shortcuts/registry";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded border bg-muted text-[10px] font-mono text-muted-foreground">
      {children}
    </kbd>
  );
}

function renderKeys(keys: string) {
  // "Ctrl+Shift+N" → tres kbd; "g d" → dos kbd.
  const parts = keys.includes("+") ? keys.split("+") : keys.split(" ");
  return (
    <span className="flex items-center gap-1">
      {parts.map((p, i) => (
        <Kbd key={`${p}-${i}`}>{p}</Kbd>
      ))}
    </span>
  );
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: Props) {
  const { actions } = usePageActionsContext();
  const hasPageNew = Boolean(actions.onNew);
  const hasPageRefresh = Boolean(actions.onRefresh);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>
            Acelera tu trabajo en LiftGo con el teclado. Presiona <Kbd>?</Kbd> en cualquier momento para abrir esta ayuda.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Global</h4>
            <ul className="space-y-2">
              {GLOBAL_SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">{s.description}</span>
                  {renderKeys(s.keys)}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Página actual
            </h4>
            {hasPageNew || hasPageRefresh ? (
              <ul className="space-y-2">
                {hasPageNew && (
                  <li className="flex items-center justify-between gap-3 text-sm">
                    <span>{actions.newLabel ?? "Nuevo registro"}</span>
                    {renderKeys("N")}
                  </li>
                )}
                {hasPageRefresh && (
                  <li className="flex items-center justify-between gap-3 text-sm">
                    <span>Refrescar listado</span>
                    {renderKeys("R")}
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Esta página no tiene atajos contextuales registrados.
              </p>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              {PAGE_SHORTCUTS.map((s) => s.keys).join(" · ")} están disponibles donde aplique.
            </p>
          </section>

          <section className="md:col-span-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Ir a (presiona <Kbd>g</Kbd> y luego)
            </h4>
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4">
              {NAV_SHORTCUTS.map((n) => (
                <li key={n.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{n.label}</span>
                  {renderKeys(`g ${n.key}`)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
