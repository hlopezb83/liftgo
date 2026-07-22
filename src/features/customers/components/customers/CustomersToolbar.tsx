import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { PlusCircle, DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/layouts/RoleGuard";
import { exportToCsv } from "@/lib/exportCsv";
import type { Customer } from "../../hooks/customers/useCustomers";

interface Props {
  filtered: Customer[] | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
  hasActive?: boolean;
  onClear?: () => void;
}

export function CustomersActions({ filtered, onCreate }: Pick<Props, "filtered" | "onCreate">) {
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          exportToCsv(
            "clientes.csv",
            (filtered || []).map((c) => ({
              Nombre: c.name,
              Correo: c.email || "",
              Teléfono: c.phone || "",
              Contacto: c.contact_person || "",
              Dirección: c.address || "",
            })),
          )
        }
      >
        <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
      </Button>
      {/* R7 Bloque 8: Nuevo cliente exige `full` según matriz de permisos. */}
      <RoleGuard module="Clientes" minAccess="full" fallback={null}>
        <Button onClick={onCreate} size="sm" aria-label="Agregar cliente"><PlusCircle className="h-4 w-4 mr-1" /> Nuevo Cliente</Button>
      </RoleGuard>
    </div>
  );
}

export function CustomersFilters({
  search,
  onSearchChange,
  hasActive,
  onClear,
}: Pick<Props, "search" | "onSearchChange" | "hasActive" | "onClear">) {
  return (
    <FiltersToolbar>
      <FiltersToolbar.Search value={search} onChange={onSearchChange} placeholder="Buscar clientes..." />
      {onClear && (
        <FiltersToolbar.ClearAll visible={!!hasActive} onClick={onClear} />
      )}
    </FiltersToolbar>
  );
}
