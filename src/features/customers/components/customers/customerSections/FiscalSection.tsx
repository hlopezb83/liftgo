import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormSection } from "@/components/forms/FormSection";
import { REGIMEN_FISCAL, USO_CFDI } from "@/lib/domain/satCatalogs";
import type { CustomerFormData } from "../../../lib/customerFormSchema";

export function FiscalSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
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
          name="domicilio_fiscal_cp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>C.P. Fiscal</FormLabel>
              <FormControl>
                <Input placeholder="64000" maxLength={5} {...field} />
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
                    <SelectItem key={r.code} value={r.code}>{r.code} — {r.label}</SelectItem>
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
                    <SelectItem key={u.code} value={u.code}>{u.code} — {u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name="representante_legal"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Representante Legal (opcional)</FormLabel>
            <FormControl>
              <Input placeholder="Lic. Juan Pérez" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </FormSection>
  );
}
