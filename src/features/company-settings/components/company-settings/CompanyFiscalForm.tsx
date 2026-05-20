import { useFormContext } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Building2, Save } from "lucide-react";
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";

export interface FiscalFormValues {
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  lugar_expedicion: string;
  logo_url: string;
}

interface Props {
  isPending: boolean;
}

export function CompanyFiscalForm({ isPending }: Props) {
  const form = useFormContext<FiscalFormValues>();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Información Fiscal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField control={form.control} name="rfc" render={({ field }) => (
            <FormItem className="space-y-1.5">
              <FormLabel>RFC *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  placeholder="XAXX010101000"
                  maxLength={13}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="razon_social" render={({ field }) => (
            <FormItem className="space-y-1.5">
              <FormLabel>Razón Social *</FormLabel>
              <FormControl><Input {...field} placeholder="Mi Empresa S.A. de C.V." /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField control={form.control} name="regimen_fiscal" render={({ field }) => (
            <FormItem className="space-y-1.5">
              <FormLabel>Régimen Fiscal *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar régimen" /></SelectTrigger></FormControl>
                <SelectContent className="max-h-60 overflow-y-auto z-50">
                  {REGIMEN_FISCAL.map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="lugar_expedicion" render={({ field }) => (
            <FormItem className="space-y-1.5">
              <FormLabel>Lugar de Expedición (C.P.) *</FormLabel>
              <FormControl><Input {...field} placeholder="06600" maxLength={5} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={isPending}>
            <Save className="h-4 w-4 mr-1" />
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
