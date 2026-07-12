import { useFormContext } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FORKLIFT_STATUSES, FUEL_TYPES, STATUS_LABELS, FUEL_TYPE_LABELS } from "@/lib/constants";
import type { ForkliftFormData } from "../../lib/forkliftFormSchema";

interface Props {
  isEdit: boolean;
  manufacturers: string[];
  filteredModels: { id: string; model: string }[];
  onManufacturerChange: (value: string) => void;
  onModelChange: (value: string) => void;
}

export function EquipmentDetailsSection({
  isEdit, manufacturers, filteredModels, onManufacturerChange, onModelChange,
}: Props) {
  const { control, watch } = useFormContext<ForkliftFormData>();
  const manufacturer = watch("manufacturer");

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Detalles del Equipo</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField control={control} name="name" render={({ field }) => (
          <FormItem><FormLabel>Nombre / ID *</FormLabel><FormControl><Input placeholder="MC-007" {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <FormField control={control} name="manufacturer" render={({ field }) => (
          <FormItem>
            <FormLabel>Fabricante</FormLabel>
            <Select value={field.value} onValueChange={onManufacturerChange}>
              <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar fabricante" /></SelectTrigger></FormControl>
              <SelectContent>
                {manufacturers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={control} name="model" render={({ field }) => (
          <FormItem>
            <FormLabel>Modelo *</FormLabel>
            <Select key={manufacturer} value={field.value} onValueChange={onModelChange} disabled={!manufacturer}>
              <FormControl><SelectTrigger><SelectValue placeholder={manufacturer ? "Seleccionar modelo" : "Primero selecciona fabricante"} /></SelectTrigger></FormControl>
              <SelectContent>
                {filteredModels.map((m) => <SelectItem key={m.id} value={m.model}>{m.model}</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={control} name="year" render={({ field }) => (
          <FormItem><FormLabel>Año</FormLabel><FormControl><Input type="number" placeholder="2023" {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <FormField control={control} name="capacity_kg" render={({ field }) => (
          <FormItem><FormLabel>Capacidad (kg)</FormLabel><FormControl><Input type="number" placeholder="2500" {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <FormField control={control} name="mast_height_m" render={({ field }) => (
          <FormItem><FormLabel>Altura del Mástil (m)</FormLabel><FormControl><Input type="number" placeholder="4.5" {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <FormField control={control} name="serial_number" render={({ field }) => (
          <FormItem><FormLabel>Número de Serie</FormLabel><FormControl><Input placeholder="HY-2023-007" {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <FormField control={control} name="fuel_type" render={({ field }) => (
          <FormItem>
            <FormLabel>Tipo de Combustible</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                {FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{FUEL_TYPE_LABELS[f] || f}</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        {!isEdit && (
          <FormField control={control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Estado Inicial</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {FORKLIFT_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        )}
      </CardContent>
    </Card>
  );
}
