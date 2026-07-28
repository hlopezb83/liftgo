import { SpinnerIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay, cn } from "@/lib/utils";
import {
  useBankMatchCandidates,
  DATE_WINDOW_OPTIONS,
  type DateWindow,
} from "../hooks/useBankMatchCandidates";

interface Props {
  lineId: string;
  search: string;
  onSearchChange: (v: string) => void;
  dateWindow: DateWindow;
  onDateWindowChange: (v: DateWindow) => void;
  onSelect: (candidateId: string) => void;
  disabled?: boolean;
}

function scoreTone(score: number): string {
  if (score >= 90) return "bg-success/15 text-success border-success/30";
  if (score >= 70) return "bg-warning/15 text-warning border-warning/30";
  return "bg-muted text-muted-foreground";
}

export function BankMatchCandidateList({
  lineId,
  search,
  onSearchChange,
  dateWindow,
  onDateWindowChange,
  onSelect,
  disabled,
}: Props) {
  const debouncedSearch = useDebouncedValue(search, 250);
  const { data: candidates = [], isFetching } = useBankMatchCandidates({
    lineId,
    search: debouncedSearch,
    dateWindow,
  });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Folio, proveedor, cliente o referencia…"
          className="h-8 text-xs"
        />
        <Select
          value={String(dateWindow)}
          onValueChange={(v) => onDateWindowChange(Number(v) as DateWindow)}
        >
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_WINDOW_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                ± {d} días
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isFetching ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <SpinnerIcon className="mr-1 h-3 w-3 animate-spin" /> Buscando candidatos…
        </div>
      ) : candidates.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          Sin candidatos con este monto en ± {dateWindow} días. Amplía la ventana de fechas o marca
          el movimiento como ignorado.
        </p>
      ) : (
        <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
          {candidates.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-2 rounded-md border p-2 text-xs"
              data-testid="bank-candidate"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium">{c.label}</p>
                <p className="text-muted-foreground">
                  {formatDateDisplay(c.candidate_date)} ·{" "}
                  <span className="font-mono tabular-nums">{formatCurrency(c.amount)}</span>
                  {c.reference ? ` · ${c.reference}` : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                      scoreTone(c.score),
                    )}
                  >
                    Score {c.score}
                  </span>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {c.exact_amount ? "Monto exacto" : "Monto aproximado"}
                  </Badge>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {c.day_diff === 0 ? "Mismo día" : `${c.day_diff} d de diferencia`}
                  </Badge>
                  {c.reference_hit && (
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      Referencia coincide
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-xs"
                disabled={disabled || !c.exact_amount}
                title={
                  c.exact_amount
                    ? undefined
                    : "El importe debe coincidir exactamente con el movimiento"
                }
                data-testid="bank-candidate-match"
                onClick={() => onSelect(c.id)}
              >
                Emparejar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
