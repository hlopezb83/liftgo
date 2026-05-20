import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { REGIMEN_FISCAL, USO_CFDI } from "@/lib/domain/satCatalogs";
import type { CustomerFormData } from "@/lib/formSchemas";
import { SectionHeading } from "./SectionHeading";

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
