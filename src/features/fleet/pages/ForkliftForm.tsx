import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { AlertTriangle } from "lucide-react";
import { useForkliftFormLogic } from "../hooks/useForkliftFormLogic";
import { EquipmentDetailsSection } from "../components/forklift-form/EquipmentDetailsSection";
import { RatesSection } from "../components/forklift-form/RatesSection";
import { InsuranceSection } from "../components/forklift-form/InsuranceSection";

export default function ForkliftForm() {
  const {
    isEdit, navigate, form,
    hasModels, manufacturers, filteredModels,
    handleManufacturerChange, handleModelChange, onSubmit, isPending,
  } = useForkliftFormLogic();

  if (!isEdit && !hasModels) {
    return (
      <div className="p-6 max-w-3xl">
        <FormPageHeader title="Agregar Montacargas" />
        <Alert className="mt-6">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Configura modelos de equipo primero</AlertTitle>
          <AlertDescription className="mt-2">
            Para agregar un montacargas, primero debes registrar al menos un modelo de equipo en Configuración de Operaciones.
          </AlertDescription>
        </Alert>
        <div className="flex gap-3 mt-4">
          <Button onClick={() => navigate("/settings/operations")}>Ir a Configuración</Button>
          <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <FormPageHeader title={isEdit ? "Editar Montacargas" : "Agregar Montacargas"} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <EquipmentDetailsSection
            isEdit={isEdit}
            manufacturers={manufacturers}
            filteredModels={filteredModels}
            onManufacturerChange={handleManufacturerChange}
            onModelChange={handleModelChange}
          />

          <RatesSection />

          <InsuranceSection />

          <Card>
            <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
            <CardContent>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea placeholder="Notas internas sobre este montacargas..." rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <FormActions
            submitLabel={isEdit ? "Guardar Cambios" : "Agregar Montacargas"}
            isPending={isPending}
            onCancel={() => navigate(-1)}
          />
        </form>
      </Form>
    </div>
  );
}
