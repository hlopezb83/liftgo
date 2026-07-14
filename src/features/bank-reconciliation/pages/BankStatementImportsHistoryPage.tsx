import { useMemo, useState } from "react";
import {
  DataTableV2,
  useLiftgoTable,
  type ColumnDef,
} from "@/components/dataTable/v2";
import { DeleteIcon, BackIcon } from "@/components/icons";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserRole } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateDisplay } from "@/lib/utils";
import { useBankStatementImports, useDeleteBankImport } from "../hooks/useBankStatementImports";

type ImportRow = NonNullable<ReturnType<typeof useBankStatementImports>["data"]>[number];

export default function BankStatementImportsHistoryPage() {
  const navigate = useNavigateTransition();
  const { data: imports, isLoading } = useBankStatementImports();
  const { data: role } = useUserRole();
  const del = useDeleteBankImport();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const canDelete = role === "admin";

  const columns = useMemo<ColumnDef<ImportRow>[]>(
    () => [
      {
        id: "created_at",
        header: "Fecha import",
        accessorKey: "created_at",
        cell: ({ row }) => <span className="text-xs">{formatDateDisplay(row.original.created_at)}</span>,
      },
      {
        id: "bank_account_name",
        header: "Cuenta",
        accessorKey: "bank_account_name",
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.bank_account_name}
            {row.original.bank_account_last4 && (
              <span className="text-muted-foreground"> ····{row.original.bank_account_last4}</span>
            )}
          </span>
        ),
      },
      {
        id: "file_name",
        header: "Archivo",
        accessorKey: "file_name",
        cell: ({ row }) => (
          <span className="text-xs font-mono truncate max-w-[200px] inline-block align-middle">
            {row.original.file_name}
          </span>
        ),
      },
      {
        id: "period",
        header: "Periodo",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.period_start && row.original.period_end
              ? `${formatDateDisplay(row.original.period_start)} → ${formatDateDisplay(row.original.period_end)}`
              : "—"}
          </span>
        ),
      },
      {
        id: "total_count",
        header: "Líneas",
        accessorKey: "total_count",
        meta: { align: "right" },
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.total_count}</span>,
      },
      {
        id: "matched_count",
        header: "Conciliadas",
        accessorKey: "matched_count",
        meta: { align: "right" },
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.matched_count}</span>,
      },
      {
        id: "pct",
        header: "% Concil.",
        meta: { align: "right" },
        accessorFn: (i) => (i.total_count > 0 ? (i.matched_count / i.total_count) * 100 : 0),
        cell: ({ row }) => {
          const i = row.original;
          const pct = i.total_count > 0 ? Math.round((i.matched_count / i.total_count) * 100) : 0;
          return (
            <Badge variant={pct === 100 ? "default" : pct >= 50 ? "secondary" : "outline"} className="text-3xs">
              {pct}%
            </Badge>
          );
        },
      },
      ...(canDelete
        ? [{
            id: "actions",
            header: "",
            enableSorting: false,
            meta: { align: "right", cellClassName: "w-12" },
            cell: ({ row }) => (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(row.original.id);
                }}
                aria-label="Eliminar import"
              >
                <DeleteIcon className="h-3.5 w-3.5" />
              </Button>
            ),
          } satisfies ColumnDef<ImportRow>]
        : []),
    ],
    [canDelete],
  );

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
