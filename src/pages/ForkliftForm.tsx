import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { NotesCard } from "@/components/NotesCard";
import { AlertTriangle } from "lucide-react";
import { useForkliftFormLogic } from "@/hooks/useForkliftFormLogic";
import { EquipmentDetailsSection } from "@/components/forklift-form/EquipmentDetailsSection";
import { RatesSection } from "@/components/forklift-form/RatesSection";
import { InsuranceSection } from "@/components/forklift-form/InsuranceSection";

export default function ForkliftForm() {
  const {
    isEdit, navigate, form, set,
    hasModels, manufacturers, filteredModels,
    handleManufacturerChange, handleModelChange, handleSubmit, isPending,
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <EquipmentDetailsSection
          form={form}
          set={set}
          isEdit={isEdit}
          manufacturers={manufacturers}
          filteredModels={filteredModels}
          onManufacturerChange={handleManufacturerChange}
          onModelChange={handleModelChange}
        />

        <RatesSection form={form} set={set} />

        <InsuranceSection form={form} set={set} />

        <NotesCard value={form.notes} onChange={(v) => set("notes", v)} placeholder="Notas internas sobre este montacargas..." />

        <FormActions
          submitLabel={isEdit ? "Guardar Cambios" : "Agregar Montacargas"}
          isPending={isPending}
          onCancel={() => navigate(-1)}
        />
      </form>
    </div>
  );
}
