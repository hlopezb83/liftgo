import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";

interface Props {
  kind: "payment" | "supplier_payment";
  onSelect: (pid: string) => void;
}

interface Candidate {
  id: string;
  date: string;
  amount: number;
  reference: string | null;
  label: string;
}

export function ManualMatchPicker({ kind, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        if (kind === "payment") {
          const { data } = await supabase
            .from("payments")
            .select("id, payment_date, amount, reference_number, invoices(invoice_number, customer_name)")
            .order("payment_date", { ascending: false })
            .limit(20);
          if (cancelled) return;
          const mapped: Candidate[] = (data ?? []).map((p) => ({
            id: p.id,
            date: p.payment_date,
            amount: Number(p.amount),
            reference: p.reference_number,
            label: `${(p.invoices as { invoice_number?: string } | null)?.invoice_number ?? "—"} · ${(p.invoices as { customer_name?: string } | null)?.customer_name ?? ""}`,
          }));
          setResults(mapped);
        } else {
          const { data } = await supabase
            .from("supplier_payments")
            .select("id, payment_date, amount, reference, supplier_bills(bill_number, suppliers(name))")
            .order("payment_date", { ascending: false })
            .limit(20);
          if (cancelled) return;
          const mapped: Candidate[] = (data ?? []).map((p) => ({
            id: p.id,
            date: p.payment_date,
            amount: Number(p.amount),
            reference: p.reference,
            label: `${(p.supplier_bills as { bill_number?: string } | null)?.bill_number ?? "—"} · ${((p.supplier_bills as { suppliers?: { name?: string } } | null)?.suppliers?.name) ?? ""}`,
          }));
          setResults(mapped);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [kind]);

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
      {loading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground text-xs"><Loader2 className="h-3 w-3 animate-spin mr-1" /> Cargando candidatos…</div>
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
