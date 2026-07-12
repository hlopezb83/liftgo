import { useState } from "react";
import { SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { useManualMatchCandidates, type ManualMatchKind } from "../hooks/useManualMatchCandidates";

interface Props {
  kind: ManualMatchKind;
  onSelect: (pid: string) => void;
}

export function ManualMatchPicker({ kind, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const { data: results = [], isPending } = useManualMatchCandidates(kind);

  const filtered = query.trim()
    ? results.filter((r) =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        (r.reference ?? "").toLowerCase().includes(query.toLowerCase()) ||
        String(r.amount).includes(query),
      )
    : results;

  return (
    <div className="space-y-2">
      <Input placeholder="Buscar por monto, referencia o nombre..." value={query} onChange={(e) => setQuery(e.target.value)} />
      {isPending ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground text-xs"><SpinnerIcon className="h-3 w-3 animate-spin mr-1" /> Cargando candidatos…</div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin candidatos</p>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-y-auto">
          {filtered.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.label}</p>
                <p className="text-muted-foreground">{formatDateDisplay(r.date)} · {formatCurrency(r.amount)} {r.reference ? `· ${r.reference}` : ""}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onSelect(r.id)}>Emparejar</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
