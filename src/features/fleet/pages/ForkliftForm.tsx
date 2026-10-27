import { FormActions } from "@/components/forms/FormActions";
import { WarnIcon } from "@/components/icons";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { EquipmentDetailsSection } from "../components/forklift-form/EquipmentDetailsSection";
import { InsuranceSection } from "../components/forklift-form/InsuranceSection";
import { RatesSection } from "../components/forklift-form/RatesSection";
import { useForkliftFormLogic } from "../hooks/useForkliftFormLogic";

export default function ForkliftForm() {
  const {
    isEdit, navigate, form,
    hasModels, manufacturers, filteredModels,
    handleManufacturerChange, handleModelChange, onSubmit, isPending,
  } = useForkliftFormLogic();

  if (!isEdit && !hasModels) {
    return (
      <PageContainer maxWidth="form">
        <FormPageHeader title="Agregar montacargas" />
        <Alert className="mt-6">
          <WarnIcon className="h-5 w-5" />
          <AlertTitle>Configura modelos de equipo primero</AlertTitle>
          <AlertDescription className="mt-2">
            Para agregar un montacargas, primero debes registrar al menos un modelo de equipo en Configuración de Operaciones.
          </AlertDescription>
        </Alert>
        <div className="flex gap-3 mt-4">
          <Button onClick={() => navigate("/settings/operations")}>Ir a Configuración</Button>
          <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="form">
      <FormPageHeader title={isEdit ? "Editar montacargas" : "Agregar montacargas"} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 [&_input]:scroll-mt-20 [&_textarea]:scroll-mt-20 [&_input]:scroll-mb-28 [&_textarea]:scroll-mb-28" onFocusCapture={(event) => {
          const field = event.target;
          if (!field.matches('input, textarea, [role="combobox"]')) return;
          requestAnimationFrame(() => {
            if (document.activeElement === field) field.scrollIntoView?.({ block: "nearest", inline: "nearest" });
          });
        }}>
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
                  <FormLabel className="sr-only">Notas</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notas internas sobre este montacargas…" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="sticky bottom-0 z-10 border-t bg-background py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" role="region" aria-label="Acciones del equipo">
            <FormActions
              submitLabel={isEdit ? "Guardar cambios" : "Agregar montacargas"}
              isPending={isPending}
              onCancel={() => navigate(-1)}
            />
          </div>
        </form>
      </Form>
    </PageContainer>
  );
}
