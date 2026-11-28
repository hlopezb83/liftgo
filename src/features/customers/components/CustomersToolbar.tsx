import { useId } from "react";
import { ROUTES } from "@/app-routes/routes";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { PlusCircle, DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/layouts/RoleGuard";
import { exportToCsv } from "@/lib/exportCsv";
import { Link } from "@/lib/router-compat-ui";
import { SAT_VALIDATION_ROLES } from "../lib/satAccess";
import type { Customer } from "../hooks/useCustomers";

interface Props {
  filtered: Customer[] | undefined;
  exportDisabled?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
  hasActive?: boolean;
  onClear?: () => void;
}

export function CustomersActions({ filtered, onCreate, exportDisabled }: Pick<Props, "filtered" | "onCreate" | "exportDisabled">) {
  return (
    <div className="flex flex-wrap gap-2">
      <CustomersSecondaryActions filtered={filtered} exportDisabled={exportDisabled} />
      {/* R7 Bloque 8: Nuevo cliente exige `full` según matriz de permisos. */}
      <RoleGuard module="Clientes" minAccess="full" fallback={null}>
        <Button onClick={onCreate} size="sm" aria-label="Agregar cliente"><PlusCircle className="h-4 w-4 mr-1" /> Nuevo cliente</Button>
      </RoleGuard>
    </div>
  );
}

export function CustomersSecondaryActions({ filtered, exportDisabled }: Pick<Props, "filtered" | "exportDisabled">) {
  const exportHintId = useId();
  const exportHint = exportDisabled ? "Carga todas las páginas antes de exportar."
    : !filtered ? "Aún no hay datos de clientes listos para exportar."
    : filtered.length === 0 ? "No hay clientes en esta búsqueda para exportar." : null;
  return (
    <>
      <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        disabled={!!exportHint}
        aria-describedby={exportHint ? exportHintId : undefined}
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
      {exportHint && <p id={exportHintId} className="max-w-52 text-xs text-muted-foreground">{exportHint}</p>}
      </div>
      <RoleGuard module="Clientes" minAccess="full" allowedRoles={SAT_VALIDATION_ROLES} fallback={null}>
        <Button asChild variant="outline" size="sm">
          <Link to={ROUTES.customers.satValidation}>Validar SAT</Link>
        </Button>
      </RoleGuard>
    </>
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
      <FiltersToolbar.Search value={search} onChange={onSearchChange} placeholder="Buscar clientes…" />
      {onClear && (
        <FiltersToolbar.ClearAll visible={!!hasActive} onClick={onClear} />
      )}
    </FiltersToolbar>
  );
}
