import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Users, Star } from "lucide-react";
import { RoleGuard } from "@/layouts/RoleGuard";
import { useSupplierContacts, useDeleteSupplierContact, type SupplierContact } from "@/features/suppliers/hooks/useSupplierContacts";
import { SupplierContactFormDialog } from "./SupplierContactFormDialog";

export function SupplierContactsSection({ supplierId }: { supplierId: string }) {
  const { data: contacts = [], isLoading } = useSupplierContacts(supplierId);
  const del = useDeleteSupplierContact();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierContact | null>(null);

  const onAdd = () => { setEditing(null); setOpen(true); };
  const onEdit = (c: SupplierContact) => { setEditing(c); setOpen(true); };
  const onDelete = (c: SupplierContact) => {
    if (confirm(`¿Eliminar el contacto "${c.name}"?`)) {
      del.mutate({ id: c.id, supplier_id: supplierId });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Contactos <span className="text-muted-foreground font-normal">({contacts.length})</span>
        </CardTitle>
        <RoleGuard module="Proveedores" minAccess="full">
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1" />Agregar
          </Button>
        </RoleGuard>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Cargando…</div>
        ) : contacts.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Sin contactos registrados.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id} className="odd:bg-muted/30">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {c.name}
                      {c.is_primary && (
                        <Badge variant="secondary" className="gap-1">
                          <Star className="h-3 w-3" />Primario
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{c.role || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.email || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.phone || "—"}</TableCell>
                  <TableCell className="text-right">
                    <RoleGuard module="Proveedores" minAccess="full">
                      <Button size="icon" variant="ghost" onClick={() => onEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => onDelete(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </RoleGuard>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <SupplierContactFormDialog
        open={open}
        onOpenChange={setOpen}
        supplierId={supplierId}
        contact={editing}
      />
    </Card>
  );
}
