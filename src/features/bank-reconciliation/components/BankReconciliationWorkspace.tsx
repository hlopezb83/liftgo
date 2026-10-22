import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BANK_LINE_STATUS_LABELS, type BankLineStatus } from "../lib/bankReconciliationConstants";
import { BankLineMatchPanel } from "./BankLineMatchPanel";
import { BankStatementLinesTable } from "./BankStatementLinesTable";
import type { BankStatementLine } from "../hooks/useBankStatementLines";
import type { SortingState } from "@tanstack/react-table";

interface Props {
  lines: BankStatementLine[];
  bankAccountId: string;
  /** Moneda de la cuenta bancaria: los movimientos se expresan en ella. */
  currency: string;
  isLoading: boolean;
  virtualized?: boolean;
  status: BankLineStatus | "all";
  search: string;
  onStatusChange: (status: BankLineStatus | "all") => void;
  onSearchChange: (search: string) => void;
}

const STATUS_OPTIONS = [
  { value: "all" as const, label: "Todas" },
  ...(["unmatched", "suggested", "matched", "ignored"] as BankLineStatus[]).map((s) => ({
    value: s,
    label: BANK_LINE_STATUS_LABELS[s],
  })),
];

export function BankReconciliationWorkspace({
  lines, bankAccountId, currency, isLoading, virtualized,
  status, search, onStatusChange, onSearchChange,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "posted_date", desc: true }]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const focusLineId = useRef<string | null>(null);

  // `lines` ya corresponde al filtro y página ejecutados en el servidor.
  const visible = lines;

  const activeLine = useMemo(
    () => visible.find((l) => l.id === activeId) ?? null,
    [visible, activeId],
  );
  // Conservar el último destino mientras Radix desmonta el inspector.
  useEffect(() => {
    if (activeLine) focusLineId.current = activeLine.id;
  }, [activeLine]);

  const restoreRowFocus = useCallback((event: Event) => {
    const marker = Array.from(tableRef.current?.querySelectorAll<HTMLElement>("[data-bank-line-id]") ?? [])
      .find((node) => node.dataset.bankLineId === focusLineId.current);
    const row = marker?.closest("tr");
    // La fila vigente puede estar fuera de la ventana virtual o haber desaparecido.
    // Resolver ambos destinos al desmontar, sin mover el scroll ni usar nodos antiguos.
    const target = row?.isConnected && row.getClientRects().length > 0 ? row : tableRef.current;
    if (!target?.isConnected || target.getClientRects().length === 0) return;
    event.preventDefault();
    if (target === row) target.tabIndex = 0;
    target.focus({ preventScroll: true });
  }, []);

  // Si la línea activa deja de ser visible (cambio de pestaña/búsqueda), `activeLine`
  // queda en null por derivación: no hace falta sincronizar estado con un efecto.


  const moveActive = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const idx = visible.findIndex((l) => l.id === activeId);
      const next = idx === -1 ? 0 : Math.min(visible.length - 1, Math.max(0, idx + delta));
      setActiveId(visible[next].id);
    },
    [visible, activeId],
  );

  // Atajos de teclado: J/K (o flechas) navegan sin interceptar escritura.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        moveActive(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        moveActive(-1);
      } else if (e.key === "Escape") {
        setActiveId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveActive]);

  const handleDone = useCallback(() => {
    setActiveId(null);
  }, []);

  const table = (
    <BankStatementLinesTable
      key={JSON.stringify([bankAccountId, status, search])}
      sorting={sorting}
      onSortingChange={setSorting}
      lines={visible}
      bankAccountId={bankAccountId}
      isLoading={isLoading}
      activeId={activeId}
      onSelect={(l) => setActiveId(l.id)}
      virtualized={virtualized}
    />
  );

  return (
    <div className="space-y-3" data-testid="bank-workspace">
      <FiltersToolbar>
        <FiltersToolbar.StatusTabs
          value={status}
          onChange={(next) => { setActiveId(null); onStatusChange(next); }}
          options={STATUS_OPTIONS}
        />
        <FiltersToolbar.Search
          value={search}
          onChange={(next) => { setActiveId(null); onSearchChange(next); }}
          placeholder="Descripción, referencia o monto…"
        />
      </FiltersToolbar>

      <div ref={tableRef} role="region" aria-label="Movimientos bancarios" tabIndex={-1} className="min-w-0 w-full">{table}</div>
      <Sheet open={!!activeLine} onOpenChange={(open) => { if (!open) setActiveId(null); }}>
        <SheetContent className="overflow-y-auto sm:max-w-xl" onCloseAutoFocus={restoreRowFocus} aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Conciliar movimiento</SheetTitle>
          </SheetHeader>
          {activeLine && (
            <div className="mt-4">
              <BankLineMatchPanel line={activeLine} currency={currency} onDone={handleDone} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
