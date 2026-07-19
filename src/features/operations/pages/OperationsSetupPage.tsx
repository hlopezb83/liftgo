import { SettingsIcon, FleetIcon, MaintenanceIcon, DocumentIcon, SecurityIcon, CompanyIcon, Image as ImageIcon, ShieldAlert } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleGuard } from "@/layouts/RoleGuard";
import { CompanyLogoTab } from "../components/operations/CompanyLogoTab";
import { ContractTemplateTab } from "../components/operations/ContractTemplateTab";
import { CxpApprovalTab } from "../components/operations/CxpApprovalTab";
import { DriversTab } from "../components/operations/DriversTab";
import { EquipmentModelsTab } from "../components/operations/EquipmentModelsTab";
import { FiscalDataTab } from "../components/operations/FiscalDataTab";
import { MaintenancePoliciesTab } from "../components/operations/MaintenancePoliciesTab";
import { MechanicsTab } from "../components/operations/MechanicsTab";

export default function OperationsSetupPage() {
  return (
    <PageContainer maxWidth="wide">
      <PageHeader title="Configuración" subtitle="Administrar modelos de equipo, operadores, mecánicos, pólizas, plantillas, datos fiscales, logo y aprobaciones" />
      <Tabs defaultValue="equipment" className="mt-6">
        <div className="-mx-4 sm:mx-0 overflow-x-auto sm:[mask-image:none] [mask-image:linear-gradient(to_right,black_92%,transparent)]">
          <TabsList className="flex w-max min-w-full sm:w-full sm:flex-wrap h-auto px-4 sm:px-1">
            <TabsTrigger value="equipment" className="gap-2 whitespace-nowrap"><SettingsIcon className="h-4 w-4" />Modelos de Equipo</TabsTrigger>
            <TabsTrigger value="drivers" className="gap-2 whitespace-nowrap"><FleetIcon className="h-4 w-4" />Operadores</TabsTrigger>
            <TabsTrigger value="mechanics" className="gap-2 whitespace-nowrap"><MaintenanceIcon className="h-4 w-4" />Mecánicos</TabsTrigger>
            <TabsTrigger value="policies" className="gap-2 whitespace-nowrap"><SecurityIcon className="h-4 w-4" />Pólizas de Mantenimiento</TabsTrigger>
            <TabsTrigger value="contract-template" className="gap-2 whitespace-nowrap"><DocumentIcon className="h-4 w-4" />Plantilla de Contrato</TabsTrigger>
            <TabsTrigger value="fiscal" className="gap-2 whitespace-nowrap"><CompanyIcon className="h-4 w-4" />Datos Fiscales</TabsTrigger>
            <TabsTrigger value="logo" className="gap-2 whitespace-nowrap"><ImageIcon className="h-4 w-4" />Logo</TabsTrigger>
            <TabsTrigger value="cxp-approval" className="gap-2 whitespace-nowrap"><ShieldAlert className="h-4 w-4" />Aprobaciones CxP</TabsTrigger>
          </TabsList>
        </div>
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
        <TabsContent value="cxp-approval">
          <RoleGuard module="Configuración" minAccess="full">
            <CxpApprovalTab />
          </RoleGuard>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
