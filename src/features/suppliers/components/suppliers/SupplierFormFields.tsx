import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormSection } from "@/components/forms/FormSection";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";
import { SUPPLIER_CATEGORIES } from "../../hooks/useSuppliers";
import type { SupplierFormData } from "../../lib/supplierFormSchema";

export function SupplierFormFields() {
  const { control } = useFormContext<SupplierFormData>();

  return (
    <div className="space-y-5">
      <FormSection title="Identidad" first>
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre / Razón Social <RequiredMark /></FormLabel>
              <FormControl>
                <Input placeholder="GRUPO INDUSTRIAL DEL NORTE" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>

      <FormSection title="Datos Fiscales (CFDI)">
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
                      <SelectItem key={r.code} value={r.code}>{r.code} — {r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </FormSection>

      <FormSection title="Contacto">
        <FormField
          control={control}
          name="contact_person"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Persona de Contacto</FormLabel>
              <FormControl>
                <Input placeholder="Lic. Juan Pérez" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Correo</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="contacto@proveedor.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono</FormLabel>
                <FormControl>
                  <Input placeholder="+52 81 1234 5678" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={control}
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sitio Web</FormLabel>
              <FormControl>
                <Input placeholder="https://proveedor.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>

      <FormSection title="Dirección">
        <FormField
          control={control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dirección</FormLabel>
              <FormControl>
                <Input placeholder="Av. Industrial 123, Col. Centro, 64000, Monterrey" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>

      <FormSection title="Condiciones Comerciales">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoría</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(SUPPLIER_CATEGORIES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="default_payment_terms_days"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Días de crédito</FormLabel>
                <FormControl>
                  <Input type="number" min={0} max={365} placeholder="Ej. 30" {...field} />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Se aplicará como vencimiento al registrar nuevas CxP.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </FormSection>

      <FormSection title="Interno">
        <FormField
          control={control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notas</FormLabel>
              <FormControl>
                <Textarea placeholder="Notas internas sobre el proveedor…" rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormSection>
    </div>
  );
}
