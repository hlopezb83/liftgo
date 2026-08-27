import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { WarnIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Untranslated } from "@/components/ui/Untranslated";
import { useForkliftMap } from "@/features/fleet";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useToggleDialog } from "@/hooks/useDialogState";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { visibleListRows } from "@/lib/supabase/constants";
import { formatDateDisplay } from "@/lib/utils";
import { DeliveryFormDialog } from "../components/deliveries/DeliveryFormDialog";
import { useDeliveries, deliveryQueries } from "../hooks/useDeliveries";
import { countOverdueDeliveries, deliveryOverdueDays, deliveryOverdueLabel } from "../lib/deliveryOverdue";
import { resolveDeliveryForkliftName } from "../lib/resolveDeliveryForkliftName";

type Delivery = NonNullable<ReturnType<typeof useDeliveries>["data"]>[number];

const DELIVERY_STATUSES = ["scheduled", "in_transit", "completed", "cancelled"] as const;
const STATUS_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "scheduled", label: "Programadas" },
  { value: "in_transit", label: "En tránsito" },
  { value: "completed", label: "Completadas" },
  { value: "cancelled", label: "Canceladas" },
];
const DELIVERY_TYPES = ["delivery", "pickup", "return"] as const;
const TYPE_OPTIONS = [
  { value: "all", label: "Todos los tipos" },
  { value: "delivery", label: "Entrega" },
  { value: "pickup", label: "Recolección" },
  { value: "return", label: "Devolución" },
];

function typeLabel(type: string | null | undefined): string {
  if (type === "delivery") return "Entrega";
  if (type === "pickup") return "Recolección";
  if (type === "return") return "Devolución";
  return "—";
}

export default function DeliveriesPage() {
  const navigate = useNavigateTransition();
  const { forkliftMap } = useForkliftMap();
  const { data: deliveriesRaw, isLoading, isError, refetch } = useDeliveries();
  const deliveries = visibleListRows(deliveriesRaw);
  // Control externo del diálogo para abrirlo también desde el CTA del
  // EmptyState (mismo patrón que InventoryPage/PartFormDialog).
  const scheduleDialog = useToggleDialog();

  // Ronda C (C2): filtros estándar por estado y tipo — antes la lista mezclaba
  // entregas, recolecciones y completadas sin manera de separarlas.
  const { values, set, reset, hasActive, filtered } = useTableFilters<Delivery, {
    q: { type: "text"; fields: (keyof Delivery)[] };
    status: { type: "enum"; field: keyof Delivery; options: readonly string[] };
    type: { type: "enum"; field: keyof Delivery; options: readonly string[] };
  }>({
    items: deliveries ?? [],
    facets: {
      q: { type: "text", fields: ["delivery_number", "driver_name", "address"] as (keyof Delivery)[] },
      status: { type: "enum", field: "status", options: ["all", ...DELIVERY_STATUSES] },
      type: { type: "enum", field: "type", options: ["all", ...DELIVERY_TYPES] },
    },
  });

  const overdueCount = countOverdueDeliveries(deliveries);

  const columns: ColumnDef<Delivery>[] = [
      {
        id: "delivery_number",
        header: "Entrega #",
        accessorKey: "delivery_number",
        cell: ({ row }) => <Untranslated className="font-mono text-sm text-primary">{row.original.delivery_number}</Untranslated>,
      },
      {
        // C2: el tipo (entrega vs recolección) sólo existía en la tarjeta móvil.
        id: "type",
        header: "Tipo",
        accessorFn: (d) => typeLabel(d.type),
        cell: ({ row }) => <span className="text-sm">{typeLabel(row.original.type)}</span>,
      },
      {
        id: "scheduled_date",
        header: "Fecha",
        accessorKey: "scheduled_date",
        cell: ({ row }) => {
          const overdue = deliveryOverdueDays(row.original);
          return (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">
                {formatDateDisplay(row.original.scheduled_date)}
                {row.original.scheduled_time ? ` ${row.original.scheduled_time}` : ""}
              </span>
              {overdue > 0 && (
                <Badge variant="destructive" className="text-3xs px-1.5 py-0">{deliveryOverdueLabel(overdue)}</Badge>
              )}
            </div>
          );
        },
      },
      {
        id: "forklift_name",
        header: "Montacargas",
        // R9-P2: la lista de montacargas puede venir filtrada/paginada, así que
        // el mapa a veces no tenía la unidad y la celda quedaba en "—". La
        // consulta de entregas ya trae el join `forklifts(name, model)`: se usa
        // como fuente primaria y el mapa sólo como respaldo.
        accessorFn: (d) => resolveDeliveryForkliftName(d, forkliftMap) ?? "",
        cell: ({ row }) => {
          const name = resolveDeliveryForkliftName(row.original, forkliftMap);
          return name ? <Untranslated className="font-medium">{name}</Untranslated> : <span className="font-medium">—</span>;
        },
      },
      {
        id: "driver_name",
        header: "Operador",
        accessorFn: (d) => d.driver_name || "",
        cell: ({ row }) => row.original.driver_name || "—",
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ];

  const table = useLiftgoTable<Delivery>({
    data: filtered,
    columns,
    getRowId: (d) => d.id,
  });

  return (
    <ListPageLayout
      title="Entregas"
      subtitle="Programa y rastrea el transporte de equipos"
      totalCount={filtered.length}
      onRefresh={refetch}
      actions={<DeliveryFormDialog open={scheduleDialog.open} onOpenChange={scheduleDialog.setOpen} />}
      notice={
        <div className="space-y-3">
          {overdueCount > 0 && (
            <Alert variant="destructive">
              <WarnIcon className="h-4 w-4" />
              <AlertDescription>
                {overdueCount === 1
                  ? "Hay 1 entrega programada con fecha vencida. Reprográmala o márcala como completada."
                  : `Hay ${overdueCount} entregas programadas con fecha vencida. Reprográmalas o márcalas como completadas.`}
              </AlertDescription>
            </Alert>
          )}
          <ListTruncationNotice rows={deliveriesRaw} />
        </div>
      }
      filters={
        <FiltersToolbar>
          <FiltersToolbar.Search
            value={values.q}
            onChange={(v) => set("q", v)}
            placeholder="Buscar entregas…"
          />
          <FiltersToolbar.StatusTabs
            value={values.status}
            onChange={(v) => set("status", v)}
            options={STATUS_OPTIONS}
          />
          <FiltersToolbar.Select
            value={values.type}
            onChange={(v) => set("type", v)}
            options={TYPE_OPTIONS}
            ariaLabel="Filtrar por tipo"
          />
          <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
        </FiltersToolbar>
      }
      isLoading={isLoading}
      isError={isError}
      onRetry={() => { void refetch(); }}
      table={table}
      onRowClick={(d) => navigate(`/deliveries/${d.id}`)}
      onRowPrefetch={(d) => deliveryQueries.detail(d.id)}
      hasActiveFilters={hasActive}
      onClearFilters={reset}
      emptyMessage="No hay entregas programadas"
      emptyActionLabel="Programar entrega"
      onEmptyAction={scheduleDialog.openDialog}
      mobileCardRender={(d) => {
        const overdue = deliveryOverdueDays(d);
        return (
        <Card className="cursor-pointer" onClick={() => navigate(`/deliveries/${d.id}`)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <Untranslated className="text-xs font-mono text-muted-foreground">{d.delivery_number}</Untranslated>
              <StatusBadge status={d.status} />
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{typeLabel(d.type)}</span>
              {overdue > 0 && (
                <Badge variant="destructive" className="text-3xs px-1.5 py-0">{deliveryOverdueLabel(overdue)}</Badge>
              )}
            </div>
            <p className="text-sm font-medium">{forkliftMap.get(d.forklift_id)?.name ? <Untranslated>{forkliftMap.get(d.forklift_id)?.name}</Untranslated> : "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatDateDisplay(d.scheduled_date)}{d.scheduled_time ? ` ${d.scheduled_time}` : ""}</p>
            {d.address && <p className="text-xs text-muted-foreground truncate">{d.address}</p>}
            {d.driver_name && <p className="text-xs text-muted-foreground">Operador: {d.driver_name}</p>}
          </CardContent>
        </Card>
        );
      }}
    />
  );
}

