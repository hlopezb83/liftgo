import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPLIER_CATEGORIES } from "@/features/suppliers/hooks/useSuppliers";
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";

import { type SupplierForm } from "./supplierFormTypes";

interface Props {
  form: SupplierForm;
  setField: <K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) => void;
}

export function SupplierFormFields({ form, setField }: Props) {
  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Nombre *</Label>
          <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Nombre del proveedor" />
        </div>
        <div className="space-y-1.5">
          <Label>Persona de Contacto</Label>
          <Input value={form.contact_person} onChange={(e) => setField("contact_person", e.target.value)} />
        </div>
      </div>

      <div className="space-y-3 border-t pt-3">
        <p className="text-sm font-medium text-muted-foreground">Datos Fiscales</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>RFC</Label>
            <Input value={form.rfc} onChange={(e) => setField("rfc", e.target.value)} placeholder="XAXX010101000" />
          </div>
          <div className="space-y-1.5">
            <Label>Régimen Fiscal</Label>
            <Select value={form.regimen_fiscal} onValueChange={(v) => setField("regimen_fiscal", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {REGIMEN_FISCAL.map((r) => <SelectItem key={r.code} value={r.code}>{r.code} — {r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <Select value={form.category} onValueChange={(v) => setField("category", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
            <SelectContent>
              {Object.entries(SUPPLIER_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3 border-t pt-3">
        <p className="text-sm font-medium text-muted-foreground">Contacto</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Correo</Label>
            <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Sitio Web</Label>
          <Input value={form.website} onChange={(e) => setField("website", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Dirección</Label>
          <Input value={form.address} onChange={(e) => setField("address", e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <Label>Notas</Label>
        <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} />
      </div>
    </>
  );
}
