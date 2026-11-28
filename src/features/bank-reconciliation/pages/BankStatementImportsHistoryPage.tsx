import { useCallback, useMemo, useState } from "react";
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
import { formatDateMty } from "@/lib/format/dateFormats";
import { visibleListRows } from "@/lib/supabase/constants";
import { useBankImportsColumns, type ImportRow } from "../hooks/useBankImportsColumns";
import { useBankStatementImports, useDeleteBankImport } from "../hooks/useBankStatementImports";

function describeImportDeletion(entry: ImportRow) {
  const account = [entry.bank_account_name, entry.bank_account_last4 && `····${entry.bank_account_last4}`].filter(Boolean).join(" ");
  const period = entry.period_start && entry.period_end
    ? `${formatDateMty(entry.period_start)} a ${formatDateMty(entry.period_end)}`
    : "Sin periodo registrado";
  return `Archivo: ${entry.file_name}. Cuenta: ${account || "Sin cuenta"}. Periodo: ${period}. Se eliminarán las líneas asociadas y sus conciliaciones. Esta acción no se puede deshacer.`;
}

export default function BankStatementImportsHistoryPage() {
  const navigate = useNavigateTransition();
  const { data: imports, isLoading, isError, refetch } = useBankStatementImports();
  const { data: role } = useUserRole();
  const del = useDeleteBankImport();
  const [selectedImport, setSelectedImport] = useState<ImportRow | null>(null);
  const canDelete = role === "admin";

  const onDeleteRequest = useCallback((row: ImportRow) => setSelectedImport(row), []);
  const columns = useBankImportsColumns(canDelete, onDeleteRequest);
  const visibleImports = useMemo(() => visibleListRows(imports), [imports]);

  const table = useLiftgoTable<ImportRow>({
    data: visibleImports,
    columns,
    getRowId: (i) => i.id,
    initialSorting: [{ id: "created_at", desc: true }],
  });


  return (
    <PageContainer>
      <div className="flex items-center justify-between gap-3">
        <PageHeader
          title="Historial de estados de cuenta importados"
          subtitle="Estados de cuenta cargados y porcentaje de conciliación por archivo"
        />
        <Button variant="outline" size="sm" onClick={() => navigate("/conciliacion-bancaria")}>
          <BackIcon className="h-4 w-4 mr-1" /> Volver
        </Button>
      </div>

      {/* A4-05: error primero; el aviso usa la lista CRUDA (limit+1). */}
      {isError ? (
        <QueryErrorState entity="el historial de importaciones" onRetry={() => { void refetch(); }} />
      ) : (
      <>
      <ListTruncationNotice rows={imports} />
      <Card>
        <CardContent className="p-0">
          <DataTableV2
            table={table}
            isLoading={isLoading}
            emptyMessage="Sin estados de cuenta importados"
          />
        </CardContent>
      </Card>
      </>
      )}

      <ConfirmDialog
        open={canDelete && !!selectedImport}
        onOpenChange={(o) => { if (!o) setSelectedImport(null); }}
        title="¿Eliminar esta importación bancaria?"
        description={selectedImport ? describeImportDeletion(selectedImport) : undefined}
        confirmLabel="Eliminar"
        destructive
        loading={del.isPending}
        onConfirm={() => {
          if (!canDelete || !selectedImport || del.isPending) return;
          del.mutate(selectedImport.id, { onSettled: () => setSelectedImport(null) });
        }}
      />

    </PageContainer>
  );
}
