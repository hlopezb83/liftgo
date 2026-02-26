import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Truck, Wrench, FileText } from "lucide-react";
import { EquipmentModelsTab } from "@/components/operations/EquipmentModelsTab";
import { DriversTab } from "@/components/operations/DriversTab";
import { MechanicsTab } from "@/components/operations/MechanicsTab";
import { ContractTemplateTab } from "@/components/operations/ContractTemplateTab";
import { RoleGuard } from "@/components/RoleGuard";

export default function OperationsSetupPage() {
  return (
    <div className="p-6 max-w-5xl">
      <PageHeader title="Configuración de Operaciones" subtitle="Administrar modelos de equipo, operadores, mecánicos y plantillas" />
      <Tabs defaultValue="equipment" className="mt-6">
        <TabsList>
          <TabsTrigger value="equipment" className="gap-2"><Settings className="h-4 w-4" />Modelos de Equipo</TabsTrigger>
          <TabsTrigger value="drivers" className="gap-2"><Truck className="h-4 w-4" />Operadores</TabsTrigger>
          <TabsTrigger value="mechanics" className="gap-2"><Wrench className="h-4 w-4" />Mecánicos</TabsTrigger>
          <TabsTrigger value="contract-template" className="gap-2"><FileText className="h-4 w-4" />Plantilla de Contrato</TabsTrigger>
        </TabsList>
        <TabsContent value="equipment"><EquipmentModelsTab /></TabsContent>
        <TabsContent value="drivers"><DriversTab /></TabsContent>
        <TabsContent value="mechanics"><MechanicsTab /></TabsContent>
        <TabsContent value="contract-template">
          <RoleGuard allowed={["admin", "administrativo"]}>
            <ContractTemplateTab />
          </RoleGuard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
