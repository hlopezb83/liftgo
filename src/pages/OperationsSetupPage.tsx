import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Truck, Wrench, FileText, ShieldCheck, Building2, Image as ImageIcon } from "lucide-react";
import { EquipmentModelsTab } from "@/components/operations/EquipmentModelsTab";
import { DriversTab } from "@/components/operations/DriversTab";
import { MechanicsTab } from "@/components/operations/MechanicsTab";
import { ContractTemplateTab } from "@/components/operations/ContractTemplateTab";
import { MaintenancePoliciesTab } from "@/components/operations/MaintenancePoliciesTab";
import { FiscalDataTab } from "@/components/operations/FiscalDataTab";
import { CompanyLogoTab } from "@/components/operations/CompanyLogoTab";
import { RoleGuard } from "@/components/RoleGuard";

export default function OperationsSetupPage() {
  return (
    <div className="p-6 max-w-5xl">
      <PageHeader title="Configuración" subtitle="Administrar modelos de equipo, operadores, mecánicos, pólizas, plantillas, datos fiscales y logo" />
      <Tabs defaultValue="equipment" className="mt-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="equipment" className="gap-2"><Settings className="h-4 w-4" />Modelos de Equipo</TabsTrigger>
          <TabsTrigger value="drivers" className="gap-2"><Truck className="h-4 w-4" />Operadores</TabsTrigger>
          <TabsTrigger value="mechanics" className="gap-2"><Wrench className="h-4 w-4" />Mecánicos</TabsTrigger>
          <TabsTrigger value="policies" className="gap-2"><ShieldCheck className="h-4 w-4" />Pólizas de Mantenimiento</TabsTrigger>
          <TabsTrigger value="contract-template" className="gap-2"><FileText className="h-4 w-4" />Plantilla de Contrato</TabsTrigger>
          <TabsTrigger value="fiscal" className="gap-2"><Building2 className="h-4 w-4" />Datos Fiscales</TabsTrigger>
          <TabsTrigger value="logo" className="gap-2"><ImageIcon className="h-4 w-4" />Logo</TabsTrigger>
        </TabsList>
        <TabsContent value="equipment"><EquipmentModelsTab /></TabsContent>
        <TabsContent value="drivers"><DriversTab /></TabsContent>
        <TabsContent value="mechanics"><MechanicsTab /></TabsContent>
        <TabsContent value="policies">
          <RoleGuard module="Configuración" minAccess="full">
            <MaintenancePoliciesTab />
          </RoleGuard>
        </TabsContent>
        <TabsContent value="contract-template">
          <RoleGuard module="Configuración" minAccess="full">
            <ContractTemplateTab />
          </RoleGuard>
        </TabsContent>
        <TabsContent value="fiscal">
          <RoleGuard module="Configuración" minAccess="full">
            <FiscalDataTab />
          </RoleGuard>
        </TabsContent>
        <TabsContent value="logo">
          <RoleGuard module="Configuración" minAccess="full">
            <CompanyLogoTab />
          </RoleGuard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
