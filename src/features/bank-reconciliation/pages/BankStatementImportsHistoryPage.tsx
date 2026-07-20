import { useCallback, useState } from "react";
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { BackIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserRole } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useBankImportsColumns, type ImportRow } from "../hooks/useBankImportsColumns";
import { useBankStatementImports, useDeleteBankImport } from "../hooks/useBankStatementImports";

export default function BankStatementImportsHistoryPage() {
  const navigate = useNavigateTransition();
  const { data: imports, isLoading } = useBankStatementImports();
  const { data: role } = useUserRole();
  const del = useDeleteBankImport();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const canDelete = role === "admin";

  const onDeleteRequest = useCallback((id: string) => setConfirmId(id), []);
  const columns = useBankImportsColumns(canDelete, onDeleteRequest);

  const table = useLiftgoTable<ImportRow>({
    data: imports ?? [],
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

      <Card>
        <CardContent className="p-0">
          <DataTableV2
            table={table}
            isLoading={isLoading}
            emptyMessage="Sin imports registrados"
          />
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar import bancario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán las líneas asociadas y sus conciliaciones. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={() => {
                if (!confirmId) return;
                del.mutate(confirmId, { onSettled: () => setConfirmId(null) });
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
