import { useNavigate } from "react-router-dom";
import { useForkliftMap } from "@/hooks/useForkliftMap";
import { useDeliveries } from "@/features/deliveries/hooks/useDeliveries";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { StatusBadge } from "@/components/StatusBadge";
import { TableRow, TableCell } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateDisplay } from "@/lib/utils";
import { DeliveryFormDialog } from "@/features/deliveries/components/deliveries/DeliveryFormDialog";

export default function DeliveriesPage() {
  const navigate = useNavigate();
  const { forkliftMap } = useForkliftMap();
  const { data: deliveries, isLoading } = useDeliveries();

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(deliveries, {
    accessors: {
      delivery_number: (d) => d.delivery_number,
      scheduled_date: (d) => d.scheduled_date,
      type: (d) => d.type,
      forklift_name: (d) => forkliftMap.get(d.forklift_id)?.name || "",
      address: (d) => d.address || "",
      driver_name: (d) => d.driver_name || "",
      status: (d) => d.status,
    },
  });

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(d) => d.id}
      emptyMessage="No hay entregas programadas"
      renderCard={(d) => (
        <Card className="cursor-pointer" onClick={() => navigate(`/deliveries/${d.id}`)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-muted-foreground">{d.delivery_number}</span>
              <StatusBadge status={d.status} />
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{d.type === "delivery" ? "Entrega" : "Recolección"}</span>
            </div>
            <p className="text-sm font-medium">{forkliftMap.get(d.forklift_id)?.name || "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatDateDisplay(d.scheduled_date)}{d.scheduled_time ? ` ${d.scheduled_time}` : ""}</p>
            {d.address && <p className="text-xs text-muted-foreground truncate">{d.address}</p>}
            {d.driver_name && <p className="text-xs text-muted-foreground">Operador: {d.driver_name}</p>}
          </CardContent>
        </Card>
      )}
    />
  ) : undefined;

  return (
    <ListPageLayout
      title="Entregas"
      subtitle="Programa y rastrea el transporte de equipos"
      actions={<DeliveryFormDialog />}
      isLoading={isLoading}
      items={paginatedItems}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      emptyMessage="No hay entregas programadas"
      tableHeader={
        <TableRow>
          <SortableTableHead sortKey="delivery_number" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Entrega #</SortableTableHead>
          <SortableTableHead sortKey="scheduled_date" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Fecha</SortableTableHead>
          <SortableTableHead sortKey="forklift_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Montacargas</SortableTableHead>
          <SortableTableHead sortKey="driver_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Operador</SortableTableHead>
          <SortableTableHead sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Estado</SortableTableHead>
        </TableRow>
      }
      renderRow={(d) => (
        <TableRow key={d.id} className="hover:bg-muted/50 cursor-pointer border-l-2 border-transparent hover:border-primary transition-colors" onClick={() => navigate(`/deliveries/${d.id}`)}>
          <TableCell className="font-mono text-sm text-primary">{d.delivery_number}</TableCell>
          <TableCell className="font-mono text-sm">{formatDateDisplay(d.scheduled_date)}{d.scheduled_time ? ` ${d.scheduled_time}` : ""}</TableCell>
          <TableCell className="font-medium">{forkliftMap.get(d.forklift_id)?.name || "—"}</TableCell>
          <TableCell>{d.driver_name || "—"}</TableCell>
          <TableCell><StatusBadge status={d.status} /></TableCell>
        </TableRow>
      )}
      customContent={mobileContent}
    />
  );
}
