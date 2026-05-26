import { useFormContext } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { ForkliftFormData } from "@/features/fleet/lib/forkliftFormSchema";

export function RatesSection() {
  const { control } = useFormContext<ForkliftFormData>();
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tarifas y Costos</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField control={control} name="daily_rate" render={({ field }) => (
          <FormItem><FormLabel>Tarifa Diaria ($)</FormLabel><FormControl><Input type="number" placeholder="150" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="weekly_rate" render={({ field }) => (
          <FormItem><FormLabel>Tarifa Semanal ($)</FormLabel><FormControl><Input type="number" placeholder="750" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="monthly_rate" render={({ field }) => (
          <FormItem><FormLabel>Tarifa Mensual ($)</FormLabel><FormControl><Input type="number" placeholder="2500" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={control} name="acquisition_cost" render={({ field }) => (
          <FormItem><FormLabel>Costo de Adquisición ($)</FormLabel><FormControl><Input type="number" placeholder="250000" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      </CardContent>
    </Card>
  );
}
