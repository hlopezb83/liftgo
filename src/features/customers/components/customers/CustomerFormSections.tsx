import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { REGIMEN_FISCAL, USO_CFDI } from "@/lib/domain/satCatalogs";
import type { CustomerFormData } from "@/lib/formSchemas";

// Re-export Form so dialog can compose <Form {...form}>
export { Form };

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">{children}</p>;
}

export function IdentitySection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <div className="space-y-3">
      <SectionHeading>Identidad</SectionHeading>
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre / Empresa *</FormLabel>
            <FormControl>
              <Input placeholder="Montacargas del Norte S.A." {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export function FiscalSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <div className="space-y-3">
      <SectionHeading>Datos Fiscales (CFDI)</SectionHeading>
      <FormField
        control={control}
        name="razon_social"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Razón Social</FormLabel>
            <FormControl>
              <Input placeholder="Como aparece en la Constancia de Situación Fiscal" {...field} />
            </FormControl>
            <FormDescription>Si se deja vacío, se usará el Nombre / Empresa al timbrar.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="rfc"
          render={({ field }) => (
            <FormItem>
              <FormLabel>RFC</FormLabel>
              <FormControl>
                <Input
                  placeholder="XAXX010101000"
                  maxLength={13}
                  {...field}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="domicilio_fiscal_cp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>C.P. Fiscal</FormLabel>
              <FormControl>
                <Input placeholder="06600" maxLength={5} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="regimen_fiscal"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Régimen Fiscal</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {REGIMEN_FISCAL.map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="uso_cfdi"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Uso CFDI</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {USO_CFDI.map((u) => (
                    <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

export function ContactSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <div className="space-y-3">
      <SectionHeading>Contacto</SectionHeading>
      <div className="grid grid-cols-2 gap-4">
        <FormField control={control} name="contact_person" render={({ field }) => (
          <FormItem><FormLabel>Persona de Contacto</FormLabel><FormControl><Input placeholder="María García" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="representante_legal" render={({ field }) => (
          <FormItem><FormLabel>Representante Legal (opcional)</FormLabel><FormControl><Input placeholder="Lic. Juan Pérez" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField control={control} name="email" render={({ field }) => (
          <FormItem><FormLabel>Correo</FormLabel><FormControl><Input placeholder="contacto@empresa.com" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="phone" render={({ field }) => (
          <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input placeholder="+52 55 1234 5678" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <FormField control={control} name="website" render={({ field }) => (
        <FormItem><FormLabel>Sitio Web</FormLabel><FormControl><Input placeholder="https://example.com" {...field} /></FormControl><FormMessage /></FormItem>
      )} />
    </div>
  );
}

export function AddressNotesSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <>
      <div className="space-y-3">
        <SectionHeading>Dirección</SectionHeading>
        <FormField control={control} name="address" render={({ field }) => (
          <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input placeholder="Av. Reforma 123, Col. Centro, CDMX" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <div className="space-y-3">
        <SectionHeading>Interno</SectionHeading>
        <FormField control={control} name="notes" render={({ field }) => (
          <FormItem><FormLabel>Notas</FormLabel><FormControl><Textarea placeholder="Notas adicionales..." rows={3} {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </div>
    </>
  );
}
