
import type { ColumnDef } from "@/components/dataTable/v2";
import type { useCustomers } from "./useCustomers";

type Customer = NonNullable<ReturnType<typeof useCustomers>["data"]>[number];

export function useCustomersColumns() {
  return [
      {
        id: "name",
        header: "Nombre",
        accessorKey: "name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "rfc",
        header: "RFC",
        accessorFn: (c) => c.rfc || "",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.rfc || "—"}</span>,
      },
      {
        id: "email",
        header: "Correo",
        accessorFn: (c) => c.email || "",
        cell: ({ row }) => row.original.email || "—",
      },
      {
        id: "phone",
        header: "Teléfono",
        accessorFn: (c) => c.phone || "",
        cell: ({ row }) => row.original.phone || "—",
      },
      {
        id: "contact_person",
        header: "Persona de Contacto",
        accessorFn: (c) => c.contact_person || "",
        cell: ({ row }) => row.original.contact_person || "—",
      },
    ];
}
