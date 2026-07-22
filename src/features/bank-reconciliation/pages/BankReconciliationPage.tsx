import { useMemo, useState } from "react";
import { Link } from "react-router";
import { SettingsIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleGuard } from "@/layouts/RoleGuard";
import { BankLineDetailSheet } from "../components/BankLineDetailSheet";
import { BankStatementLinesTable } from "../components/BankStatementLinesTable";
import { BankStatementUploader } from "../components/BankStatementUploader";
import { ReconciliationKpiCards } from "../components/ReconciliationKpiCards";
import { useBankAccounts } from "../hooks/useBankAccounts";
import { useBankStatementLines, type BankStatementLine } from "../hooks/useBankStatementLines";
import type { BankLineStatus } from "../lib/bankReconciliationConstants";

const SECTIONS: { key: BankLineStatus; title: string }[] = [
  { key: "unmatched", title: "Sin emparejar" },
  { key: "suggested", title: "Sugeridas" },
  { key: "matched", title: "Conciliadas" },
  { key: "ignored", title: "Ignoradas" },
];

export default function BankReconciliationPage() {
  const { data: accounts } = useBankAccounts();
  const [manualAccountId, setManualAccountId] = useState<string | null>(null);
  // Default derivado en render: la primera cuenta activa (o la primera). El usuario puede
  // sobrescribir con el <Select>. Al elegir manualmente, `manualAccountId` toma precedencia.
  const accountId = useMemo(() => {
    if (manualAccountId) return manualAccountId;
    if (!accounts || accounts.length === 0) return null;
    return (accounts.find((a) => a.is_active) ?? accounts[0]).id;
  }, [manualAccountId, accounts]);
  const setAccountId = setManualAccountId;
  const [selected, setSelected] = useState<BankStatementLine | null>(null);
  const { data: lines, isLoading } = useBankStatementLines(accountId);

  const grouped = (() => {
    const g: Record<BankLineStatus, BankStatementLine[]> = {
      unmatched: [], suggested: [], matched: [], ignored: [],
    };
    for (const l of lines ?? []) g[l.status].push(l);
    return g;
  })();

  return (
    <RoleGuard module="Conciliación Bancaria" minAccess="read">
      <PageTransition>
        <PageContainer>
          <PageHeader
            title="Conciliación bancaria"
            subtitle="Sube tu estado de cuenta y empareja con los pagos del sistema"
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/cuentas-bancarias"><SettingsIcon className="h-4 w-4 mr-2" /> Cuentas bancarias</Link>
              </Button>
            }
          />

          {(accounts ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
              <p>Aún no tienes cuentas bancarias registradas.</p>
              <Button asChild><Link to="/cuentas-bancarias">Crear primera cuenta</Link></Button>
            </CardContent></Card>
          ) : (
            <>
              <Card><CardContent className="py-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">Cuenta:</span>
                <Select value={accountId ?? ""} onValueChange={setAccountId}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger>
                  <SelectContent>
                    {(accounts ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} {a.last4 ? `•${a.last4}` : ""} ({a.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent></Card>

              {accountId && (
                <>
                  <BankStatementUploader bankAccountId={accountId} />
                  <ReconciliationKpiCards lines={lines ?? []} />
                  {isLoading ? (
                    <Card><CardContent className="py-12 text-center text-muted-foreground">Cargando movimientos…</CardContent></Card>
                  ) : (
                    SECTIONS.map((s) => grouped[s.key].length > 0 && (
                      <div key={s.key} className="space-y-2">
                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          {s.title} ({grouped[s.key].length})
                        </h2>
                        <BankStatementLinesTable lines={grouped[s.key]} onSelect={setSelected} />
                      </div>
                    ))
                  )}
                </>
              )}
            </>
          )}

          <BankLineDetailSheet
            line={selected}
            open={!!selected}
            onOpenChange={(o) => { if (!o) setSelected(null); }}
          />
        </PageContainer>
      </PageTransition>
    </RoleGuard>
  );
}
