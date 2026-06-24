import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/forms/SearchBar";
import { PlusCircle, Download } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import type { Customer } from "../../hooks/customers/useCustomers";

interface Props {
  filtered: Customer[] | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
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
        <Download className="h-4 w-4 mr-1" />Exportar CSV
      </Button>
      <Button onClick={onCreate} size="sm" aria-label="Agregar cliente"><PlusCircle className="h-4 w-4 mr-1" /> Nuevo Cliente</Button>
    </div>
  );
}

export function CustomersFilters({ search, onSearchChange }: Pick<Props, "search" | "onSearchChange">) {
  return <SearchBar value={search} onChange={onSearchChange} placeholder="Buscar clientes..." />;
}
