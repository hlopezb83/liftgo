import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormActions } from "@/components/forms/FormActions";
import { notifyError } from "@/lib/ui/appFeedback";
import {
  SUPPLIER_CONTACT_ROLES,
  useCreateSupplierContact,
  useUpdateSupplierContact,
  type SupplierContact,
} from "../../hooks/useSupplierContacts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  contact: SupplierContact | null;
}

interface FormState {
  name: string;
  role: string;
  email: string;
  phone: string;
  notes: string;
  is_primary: boolean;
}

const empty: FormState = { name: "", role: "Principal", email: "", phone: "", notes: "", is_primary: false };

export function SupplierContactFormDialog({ open, onOpenChange, supplierId, contact }: Props) {
  const [form, setForm] = useState<FormState>(empty);
  const create = useCreateSupplierContact();
  const update = useUpdateSupplierContact();

  useEffect(() => {
    if (!open) return;
    if (contact) {
      setForm({
        name: contact.name,
        role: contact.role || "Otro",
        email: contact.email || "",
        phone: contact.phone || "",
        notes: contact.notes || "",
        is_primary: contact.is_primary,
      });
    } else {
      setForm(empty);
    }
  }, [open, contact]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      notifyError({ message: "El nombre es requerido" });
      return;
    }
    const payload = {
      name,
      role: form.role || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      is_primary: form.is_primary,
    };
    if (contact) {
      update.mutate(
        { id: contact.id, supplier_id: supplierId, patch: payload },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate(
        { ...payload, supplier_id: supplierId },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? "Editar contacto" : "Nuevo contacto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={100} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPLIER_CONTACT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Correo</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Contacto primario</Label>
              <p className="text-xs text-muted-foreground">Solo uno por proveedor.</p>
            </div>
            <Switch checked={form.is_primary} onCheckedChange={(v) => set("is_primary", v)} />
          </div>
          <DialogFooter>
            <FormActions
              submitLabel={contact ? "Guardar" : "Agregar"}
              isPending={create.isPending || update.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
