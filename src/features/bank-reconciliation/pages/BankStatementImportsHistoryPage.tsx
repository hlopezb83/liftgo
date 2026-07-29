import { useCallback, useState } from "react";
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { BackIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUserRole } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { visibleListRows } from "@/lib/supabase/constants";
import { useBankImportsColumns, type ImportRow } from "../hooks/useBankImportsColumns";
import { useBankStatementImports, useDeleteBankImport } from "../hooks/useBankStatementImports";

export default function BankStatementImportsHistoryPage() {
  const navigate = useNavigateTransition();
  const { data: imports, isLoading, isError, refetch } = useBankStatementImports();
  const { data: role } = useUserRole();
  const del = useDeleteBankImport();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const canDelete = role === "admin";

  const onDeleteRequest = useCallback((id: string) => setConfirmId(id), []);
  const columns = useBankImportsColumns(canDelete, onDeleteRequest);

  const table = useLiftgoTable<ImportRow>({
    data: visibleListRows(imports),
    columns,
    getRowId: (i) => i.id,
    initialSorting: [{ id: "created_at", desc: true }],
  });


  return (
    <PageContainer>
      <div className="flex items-center justify-between gap-3">
        <PageHeader
          title="Historial de imports bancarios"
          subtitle="Estados de cuenta cargados y porcentaje de conciliación por archivo"
        />
        <Button variant="outline" size="sm" onClick={() => navigate("/conciliacion-bancaria")}>
          <BackIcon className="h-4 w-4 mr-1" /> Volver
        </Button>
      </div>

      {/* A4-05: error primero; el aviso usa la lista CRUDA (limit+1). */}
      {isError ? (
        <QueryErrorState entity="el historial de imports" onRetry={() => { void refetch(); }} />
      ) : (
      <>
      <ListTruncationNotice rows={imports} />
      <Card>
        <CardContent className="p-0">
          <DataTableV2
            table={table}
            isLoading={isLoading}
            emptyMessage="Sin imports registrados"
          />
        </CardContent>
      </Card>
      </>
      )}

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(o) => { if (!o) setConfirmId(null); }}
        title="¿Eliminar import bancario?"
        description="Se eliminarán las líneas asociadas y sus conciliaciones. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        loading={del.isPending}
        onConfirm={() => {
          if (!confirmId) return;
          del.mutate(confirmId, { onSettled: () => setConfirmId(null) });
        }}
      />

    </PageContainer>
  );
}
