import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { BANK_LINE_STATUS_LABELS, type BankLineStatus } from "../lib/bankReconciliationConstants";
import { BankLineMatchPanel } from "./BankLineMatchPanel";
import { BankStatementLinesTable } from "./BankStatementLinesTable";
import type { BankStatementLine } from "../hooks/useBankStatementLines";

interface Props {
  lines: BankStatementLine[];
  bankAccountId: string;
  isLoading: boolean;
}

const STATUS_OPTIONS = [
  { value: "all" as const, label: "Todas" },
  ...(["unmatched", "suggested", "matched", "ignored"] as BankLineStatus[]).map((s) => ({
    value: s,
    label: BANK_LINE_STATUS_LABELS[s],
  })),
];

function matchesSearch(line: BankStatementLine, term: string): boolean {
  if (!term) return true;
  const q = term.toLowerCase();
  return (
    (line.description ?? "").toLowerCase().includes(q) ||
    (line.reference ?? "").toLowerCase().includes(q) ||
    String(Math.abs(line.signed_amount)).includes(q)
  );
}

export function BankReconciliationWorkspace({ lines, bankAccountId, isLoading }: Props) {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState<BankLineStatus | "all">("unmatched");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      lines.filter(
        (l) => (status === "all" || l.status === status) && matchesSearch(l, search.trim()),
      ),
    [lines, status, search],
  );

  const activeLine = useMemo(
    () => visible.find((l) => l.id === activeId) ?? null,
    [visible, activeId],
  );

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

  // Atajos de teclado: J/K (o flechas) navegan; C confirma la sugerencia activa.
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
      lines={visible}
      bankAccountId={bankAccountId}
      isLoading={isLoading}
      activeId={activeId}
      onSelect={(l) => setActiveId(l.id)}
    />
  );

  return (
    <div className="space-y-3" data-testid="bank-workspace">
      <FiltersToolbar>
        <FiltersToolbar.StatusTabs
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
        />
        <FiltersToolbar.Search
          value={search}
          onChange={setSearch}
          placeholder="Descripción, referencia o monto…"
        />
      </FiltersToolbar>

      {isMobile ? (
        <>
          {table}
          <Sheet open={!!activeLine} onOpenChange={(o) => { if (!o) setActiveId(null); }}>
            <SheetContent className="overflow-y-auto sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>Conciliar movimiento</SheetTitle>
              </SheetHeader>
              {activeLine && (
                <div className="mt-4">
                  <BankLineMatchPanel line={activeLine} onDone={handleDone} />
                </div>
              )}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">{table}</div>
          <Card className="h-fit lg:sticky lg:top-4" data-testid="bank-match-panel-slot">
            <CardContent className="py-4">
              {activeLine ? (
                <BankLineMatchPanel line={activeLine} onDone={handleDone} />
              ) : (
                <EmptyState
                  title="Selecciona un movimiento"
                  subtitle="Elige una fila para ver sus candidatos de emparejamiento. Usa J / K para moverte entre movimientos."
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
