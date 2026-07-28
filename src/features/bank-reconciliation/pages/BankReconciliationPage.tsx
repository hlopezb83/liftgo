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
import { BankReconciliationWorkspace } from "../components/BankReconciliationWorkspace";
import { BankStatementUploader } from "../components/BankStatementUploader";
import { ReconciliationKpiCards } from "../components/ReconciliationKpiCards";
import { useBankAccounts } from "../hooks/useBankAccounts";
import { useBankStatementLines } from "../hooks/useBankStatementLines";

export default function BankReconciliationPage() {
  const { data: accounts, isLoading: isLoadingAccounts } = useBankAccounts();
  const [manualAccountId, setManualAccountId] = useState<string | null>(null);
  // Default derivado en render: la primera cuenta activa (o la primera). El usuario puede
  // sobrescribir con el <Select>. Al elegir manualmente, `manualAccountId` toma precedencia.
  const account = useMemo(() => {
    if (!accounts || accounts.length === 0) return null;
    if (manualAccountId) return accounts.find((a) => a.id === manualAccountId) ?? null;
    return accounts.find((a) => a.is_active) ?? accounts[0];
  }, [manualAccountId, accounts]);
  const accountId = account?.id ?? null;
  const { data: lines, isLoading } = useBankStatementLines(accountId);

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
                <Select value={accountId ?? ""} onValueChange={setManualAccountId}>
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
                  <ReconciliationKpiCards lines={lines ?? []} currency={account?.currency ?? "MXN"} />
                  <BankReconciliationWorkspace
                    lines={lines ?? []}
                    bankAccountId={accountId}
                    isLoading={isLoading}
                  />
                </>
              )}
            </>
          )}
        </PageContainer>
      </PageTransition>
    </RoleGuard>
  );
}
