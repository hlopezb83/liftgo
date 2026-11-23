import { useState } from "react";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { Camera } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasModuleAccess } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useDialogState, useToggleDialog } from "@/hooks/useDialogState";
import { DAMAGE_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { DamageRecordWithJoins } from "@/types/rental";
import { DamageDetailSheet } from "../components/damage/DamageDetailSheet";
import { ReportDamageDialog } from "../components/damage/ReportDamageDialog";
import { useDamagePhotoCounts } from "../hooks/useDamagePhotoCounts";
import { useDamageRecords } from "../hooks/useDamageRecords";

type DamageRow = NonNullable<ReturnType<typeof useDamageRecords>["data"]>[number];
type DamageStatus = (typeof DAMAGE_STATUSES)[number];
const DAMAGE_STATUS_OPTIONS = [
  { value: "all" as const, label: "Todos los estados" },
  ...DAMAGE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })),
];

export default function DamageTrackingPage() {
  const canWrite = useHasModuleAccess("Daños", "full");
  // R5-A6: vista de archivados para poder restaurarlos.
  const [showArchived, setShowArchived] = useState(false);
  const { data: records, isLoading, isError, refetch } = useDamageRecords(showArchived);
  const photoQuery = useDamagePhotoCounts();
  const photoCounts = photoQuery.isError ? undefined : photoQuery.data;
  const detail = useDialogState<DamageRecordWithJoins>();
  // Control externo del diálogo de reporte para poder abrirlo también desde
  // el CTA del EmptyState (mismo patrón que InventoryPage/PartFormDialog).
  const reportDialog = useToggleDialog();

  const { values, set, reset, hasActive, filtered } = useTableFilters<DamageRow, {
    q: { type: "text"; fields: (keyof DamageRow)[]; accessors: ((r: DamageRow) => string | null | undefined)[] };
    status: { type: "enum"; field: keyof DamageRow; options: readonly (DamageStatus | "all")[] };
  }>({
    items: records ?? [],
    facets: {
      q: {
        type: "text",
        fields: ["description"] as (keyof DamageRow)[],
        accessors: [(r) => r.forklifts?.name, (r) => r.customers?.name],
      },
      status: { type: "enum", field: "status", options: ["all", ...DAMAGE_STATUSES] as const },
    },
  });

  const columns = buildDamageColumns(photoCounts);


  const table = useLiftgoTable<DamageRow>({
    data: filtered,
    columns,
    getRowId: (r) => r.id,
  });

  return (
    <>
      <ListPageLayout
        title="Seguimiento de Daños"
        subtitle="Rastrea daños desde inspecciones hasta reparación y facturación"
        actions={canWrite ? <ReportDamageDialog open={reportDialog.open} onOpenChange={reportDialog.setOpen} /> : undefined}
        filters={
          <FiltersToolbar>
            <FiltersToolbar.Search
              value={values.q}
              onChange={(v) => set("q", v)}
              placeholder="Buscar por descripción, montacargas…"
            />
            <FiltersToolbar.StatusSelect
              value={values.status}
              onChange={(v) => set("status", v as DamageStatus | "all")}
              options={DAMAGE_STATUS_OPTIONS}
            />
            <Select value={showArchived ? "archived" : "active"} onValueChange={(v) => setShowArchived(v === "archived")}>
              <SelectTrigger aria-label="Mostrar registros activos o archivados" className="w-full sm:w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="archived">Archivados</SelectItem>
              </SelectContent>
            </Select>
            <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
          </FiltersToolbar>
        }

        notice={<PhotoCountNotice
          isLoading={photoQuery.isLoading}
          isError={photoQuery.isError}
          isRetrying={photoQuery.isFetching}
          onRetry={() => { void photoQuery.refetch(); }}
        />}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        table={table}
        rowAction={{ columnId: "forklift_name", label: (r) => `Ver daño de ${r.forklifts?.name || "equipo"}` }}
        onRowClick={(r) => detail.open(r as DamageRecordWithJoins)}
        hasActiveFilters={hasActive}
        onClearFilters={reset}
        emptyMessage="No se encontraron registros de daños"
        emptyActionLabel={canWrite ? "Reportar daño" : undefined}
        onEmptyAction={canWrite ? reportDialog.openDialog : undefined}
        mobileCardRender={(r) => (
          <Card className="relative focus-within:ring-2 focus-within:ring-ring">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{formatDateMty(r.created_at)}</span>
                  {photoCounts && <PhotoCountBadge count={photoCounts[r.id] ?? 0} />}
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm font-medium">{r.forklifts?.name || "—"}</p>
              <p className="text-sm text-muted-foreground">{r.customers?.name || "—"}</p>
              <p className="text-sm text-muted-foreground truncate">{r.description}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm">{r.estimated_cost == null ? "Sin estimación" : formatCurrency(r.estimated_cost)}</span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="after:absolute after:inset-0"
                  aria-label={`Ver daño de ${r.forklifts?.name || "equipo"} del ${formatDateMty(r.created_at)}`}
                  onClick={() => detail.open(r)}
                >
                  Ver detalle
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      />

      <DamageDetailSheet
        // R18-A2: re-derivar el record actual desde la cache para que el sheet
        // muestre estatus/costos actualizados tras mutaciones (facturar,
        // reparar, cancelar), en vez de la snapshot capturada al abrir.
        record={detail.selected ? (records?.find((r) => r.id === detail.selected?.id) ?? detail.selected) : null}
        open={detail.isOpen}
        onOpenChange={detail.onOpenChange}
      />
    </>
  );
}

function PhotoCountNotice({ isLoading, isError, isRetrying, onRetry }: {
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  if (isError) return (
    <div className="flex flex-wrap items-center gap-2">
      <p role="alert" className="text-sm text-destructive">No se pudo consultar el número de fotos.</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={isRetrying}>
        Reintentar fotos
      </Button>
    </div>
  );
  if (isLoading) return <p role="status" className="text-sm text-muted-foreground">Consultando fotos…</p>;
  return null;
}

function PhotoCountBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-xs text-muted-foreground">Sin fotos</span>;
  return (
    <Badge variant="secondary" className="gap-1 text-xs px-1.5 py-0">
      <Camera className="h-3 w-3" aria-hidden="true" /> {count}<span className="sr-only"> fotos</span>
    </Badge>
  );
}

function buildDamageColumns(photoCounts: Record<string, number> | undefined): ColumnDef<DamageRow>[] {
  return [
    {
      id: "created_at",
      header: "Fecha",
      accessorKey: "created_at",
      cell: ({ row }) => <span className="font-mono text-sm">{formatDateMty(row.original.created_at)}</span>,
    },
    {
      id: "forklift_name",
      header: "Montacargas",
      accessorFn: (r) => r.forklifts?.name || "",
      cell: ({ row }) => <span className="font-medium">{row.original.forklifts?.name || "—"}</span>,
    },
    {
      id: "customer_name",
      header: "Cliente",
      accessorFn: (r) => r.customers?.name || "",
      // Oleada 1 (A-7): nombres largos truncan con tooltip completo
      meta: { cellClassName: "max-w-[240px]" },
      cell: ({ row }) => {
        const name = row.original.customers?.name || "—";
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block truncate">{name}</span>
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      id: "description",
      header: "Descripción",
      enableSorting: false,
      meta: { cellClassName: "max-w-[200px] truncate" },
      cell: ({ row }) => row.original.description,
    },
    {
      id: "photos",
      header: "Fotos",
      enableSorting: false,
      meta: { align: "center", cellClassName: "w-16" },
      cell: ({ row }) => photoCounts
        ? <PhotoCountBadge count={photoCounts[row.original.id] ?? 0} />
        : <span className="text-muted-foreground text-xs">Sin confirmar</span>,
    },
    {
      id: "estimated_cost",
      header: "Costo Est.",
      accessorFn: (r) => r.estimated_cost || 0,
      meta: { kind: "money" },
      cell: ({ row }) => <span>{row.original.estimated_cost == null ? "Sin estimación" : formatCurrency(row.original.estimated_cost)}</span>,
    },
    {
      id: "status",
      header: "Estado",
      accessorKey: "status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
}
