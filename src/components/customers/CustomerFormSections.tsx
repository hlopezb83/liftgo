import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REGIMEN_FISCAL, USO_CFDI } from "@/lib/satCatalogs";
import type { CustomerFormData } from "@/lib/formSchemas";

type Setter = <K extends keyof CustomerFormData>(key: K, value: CustomerFormData[K]) => void;

interface SectionProps {
  form: CustomerFormData;
  set: Setter;
}

export function IdentitySection({ form, set }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Identidad</p>
      <div className="space-y-1.5">
        <Label>Nombre / Empresa *</Label>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Montacargas del Norte S.A." />
      </div>
    </div>
  );
}

export function FiscalSection({ form, set }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Datos Fiscales (CFDI)</p>
      <div className="space-y-1.5">
        <Label>Razón Social</Label>
        <Input
          value={form.razon_social}
          onChange={(e) => set("razon_social", e.target.value)}
          placeholder="Como aparece en la Constancia de Situación Fiscal"
        />
        <p className="text-xs text-muted-foreground">Si se deja vacío, se usará el Nombre / Empresa al timbrar.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>RFC</Label>
          <Input value={form.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} placeholder="XAXX010101000" maxLength={13} />
        </div>
        <div className="space-y-1.5">
          <Label>C.P. Fiscal</Label>
          <Input value={form.domicilio_fiscal_cp} onChange={(e) => set("domicilio_fiscal_cp", e.target.value)} placeholder="06600" maxLength={5} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Régimen Fiscal</Label>
          <Select value={form.regimen_fiscal} onValueChange={(v) => set("regimen_fiscal", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
            <SelectContent>
              {REGIMEN_FISCAL.map((r) => (
                <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Uso CFDI</Label>
          <Select value={form.uso_cfdi} onValueChange={(v) => set("uso_cfdi", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
            <SelectContent>
              {USO_CFDI.map((u) => (
                <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export function ContactSection({ form, set }: SectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Contacto</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Persona de Contacto</Label><Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} placeholder="María García" /></div>
        <div className="space-y-1.5"><Label>Representante Legal (opcional)</Label><Input value={form.representante_legal} onChange={(e) => set("representante_legal", e.target.value)} placeholder="Lic. Juan Pérez" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Correo</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="contacto@empresa.com" /></div>
        <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+52 55 1234 5678" /></div>
      </div>
      <div className="space-y-1.5"><Label>Sitio Web</Label><Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://example.com" /></div>
    </div>
  );
}

export function AddressNotesSection({ form, set }: SectionProps) {
  return (
    <>
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Dirección</p>
        <div className="space-y-1.5"><Label>Dirección</Label><Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Av. Reforma 123, Col. Centro, CDMX" /></div>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Interno</p>
        <div className="space-y-1.5"><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notas adicionales..." rows={3} /></div>
      </div>
    </>
  );
}
