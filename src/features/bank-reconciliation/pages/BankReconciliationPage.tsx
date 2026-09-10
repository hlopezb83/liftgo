import { useMemo, useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { TablePagination } from "@/components/feedback/TablePagination";
import { SettingsIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { RoleGuard } from "@/layouts/RoleGuard";
import { Link } from "@/lib/router-compat-ui";
import { BankReconciliationWorkspace } from "../components/BankReconciliationWorkspace";
import { BankStatementUploader } from "../components/BankStatementUploader";
import { ReconciliationKpiCards } from "../components/ReconciliationKpiCards";
import { useBankAccounts } from "../hooks/useBankAccounts";
import { useBankReconciliationKpis, useBankStatementLines } from "../hooks/useBankStatementLines";
import type { BankLineStatus } from "../lib/bankReconciliationConstants";

const PAGE_SIZE = 50;

// La complejidad reportada es la composición explícita de estados remotos
// (cuentas, líneas y KPI); cada rama conserva su propio error/reintento.
// eslint-disable-next-line complexity
export default function BankReconciliationPage() {
  const { data: accounts, isLoading: isLoadingAccounts, isError: isErrorAccounts, refetch: refetchAccounts } = useBankAccounts();
  const [manualAccountId, setManualAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<BankLineStatus | "all">("unmatched");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 250);
  // Default derivado en render: la primera cuenta activa (o la primera). El usuario puede
  // sobrescribir con el <Select>. Al elegir manualmente, `manualAccountId` toma precedencia.
  const account = useMemo(() => {
    if (!accounts || accounts.length === 0) return null;
    if (manualAccountId) return accounts.find((a) => a.id === manualAccountId) ?? null;
    return accounts.find((a) => a.is_active) ?? accounts[0];
  }, [manualAccountId, accounts]);
  const accountId = account?.id ?? null;
  const {
    data: lines, totalCount, isLoading,
    isError: isErrorLines, refetch: refetchLines,
  } = useBankStatementLines(accountId, {
    status,
    search: debouncedSearch,
    page,
    pageSize: PAGE_SIZE,
  });
  const {
    data: kpis,
    isLoading: isLoadingKpis,
    isError: isErrorKpis,
    refetch: refetchKpis,
  } = useBankReconciliationKpis(accountId);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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

          {/* A4-03: control bancario — nunca KPIs en 0 ante error de red. */}
          {isErrorAccounts ? (
            <QueryErrorState entity="las cuentas bancarias" onRetry={() => { void refetchAccounts(); }} />
          ) : (
          <>
          {isLoadingAccounts ? (
            <Card><CardContent className="py-6 space-y-3">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-24 w-full" />
            </CardContent></Card>
          ) : (accounts ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
              <p>Aún no tienes cuentas bancarias registradas.</p>
              <Button asChild><Link to="/cuentas-bancarias">Crear primera cuenta</Link></Button>
            </CardContent></Card>
          ) : (
            <>
              <Card><CardContent className="py-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">Cuenta:</span>
                <Select value={accountId ?? ""} onValueChange={(id) => { setManualAccountId(id); setPage(1); }}>
                  <SelectTrigger className="w-64" data-testid="bank-account-select"><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger>
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
                  {isErrorLines || isErrorKpis ? (
                    <QueryErrorState entity="la conciliación bancaria" onRetry={() => {
                      void refetchLines();
                      void refetchKpis();
                    }} />
                  ) : (
                  <>
                  <BankStatementUploader bankAccountId={accountId} />
                  {isLoadingKpis || !kpis
                    ? <Skeleton className="h-24 w-full" />
                    : <ReconciliationKpiCards kpis={kpis} currency={account?.currency ?? "MXN"} />}
                  <BankReconciliationWorkspace
                    lines={lines ?? []}
                    bankAccountId={accountId}
                    currency={account?.currency ?? "MXN"}
                    isLoading={isLoading}
                    virtualized
                    status={status}
                    search={search}
                    onStatusChange={(next) => { setStatus(next); setPage(1); }}
                    onSearchChange={(next) => { setSearch(next); setPage(1); }}
                  />
                  <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
                  </>
                  )}
                </>
              )}
            </>
          )}
          </>
          )}
        </PageContainer>
      </PageTransition>
    </RoleGuard>
  );
}
