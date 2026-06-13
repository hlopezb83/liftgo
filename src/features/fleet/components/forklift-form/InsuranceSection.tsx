import { useFormContext } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { ForkliftFormData } from "../../lib/forkliftFormSchema";

export function InsuranceSection() {
  const { control } = useFormContext<ForkliftFormData>();
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Seguro</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField control={control} name="insurance_provider" render={({ field }) => (
          <FormItem><FormLabel>Aseguradora</FormLabel><FormControl><Input placeholder="Ej: GNP Seguros" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="insurance_policy_number" render={({ field }) => (
          <FormItem><FormLabel>No. de Póliza</FormLabel><FormControl><Input placeholder="Ej: POL-2026-001" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="insurance_expiry" render={({ field }) => (
          <FormItem><FormLabel>Vigencia</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="insurance_cost" render={({ field }) => (
          <FormItem><FormLabel>Costo de Póliza ($)</FormLabel><FormControl><Input type="number" placeholder="15000" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </CardContent>
    </Card>
  );
}
