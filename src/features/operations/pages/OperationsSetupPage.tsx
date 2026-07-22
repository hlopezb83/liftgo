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
      {/* v7.181: en desktop las 8 pestañas se envolvían a dos filas. Layout
          vertical en lg+ (sidebar de tabs) evita el wrap y mejora escaneo. */}
      <Tabs defaultValue="equipment" className="mt-6 lg:grid lg:grid-cols-[220px_1fr] lg:gap-6">
        <div className="-mx-4 sm:mx-0 overflow-x-auto lg:overflow-visible sm:[mask-image:none] [mask-image:linear-gradient(to_right,black_92%,transparent)] lg:[mask-image:none]">
          <TabsList className="flex w-max min-w-full sm:w-full sm:flex-wrap lg:flex-col lg:w-full lg:items-stretch h-auto px-4 sm:px-1 lg:bg-muted/40 lg:p-1 lg:rounded-lg">
            <TabsTrigger value="equipment" className="gap-2 whitespace-nowrap lg:justify-start lg:w-full"><SettingsIcon className="h-4 w-4" />Modelos de Equipo</TabsTrigger>
            <TabsTrigger value="drivers" className="gap-2 whitespace-nowrap lg:justify-start lg:w-full"><FleetIcon className="h-4 w-4" />Operadores</TabsTrigger>
            <TabsTrigger value="mechanics" className="gap-2 whitespace-nowrap lg:justify-start lg:w-full"><MaintenanceIcon className="h-4 w-4" />Mecánicos</TabsTrigger>
            <TabsTrigger value="policies" className="gap-2 whitespace-nowrap lg:justify-start lg:w-full"><SecurityIcon className="h-4 w-4" />Pólizas de Mantenimiento</TabsTrigger>
            <TabsTrigger value="contract-template" className="gap-2 whitespace-nowrap lg:justify-start lg:w-full"><DocumentIcon className="h-4 w-4" />Plantilla de Contrato</TabsTrigger>
            <TabsTrigger value="fiscal" className="gap-2 whitespace-nowrap lg:justify-start lg:w-full"><CompanyIcon className="h-4 w-4" />Datos Fiscales</TabsTrigger>
            <TabsTrigger value="logo" className="gap-2 whitespace-nowrap lg:justify-start lg:w-full"><ImageIcon className="h-4 w-4" />Logo</TabsTrigger>
            <TabsTrigger value="cxp-approval" className="gap-2 whitespace-nowrap lg:justify-start lg:w-full"><ShieldAlert className="h-4 w-4" />Aprobaciones CxP</TabsTrigger>
          </TabsList>
        </div>
        <div className="min-w-0">
          <TabsContent value="equipment" className="mt-4 lg:mt-0"><EquipmentModelsTab /></TabsContent>
          <TabsContent value="drivers" className="mt-4 lg:mt-0"><DriversTab /></TabsContent>
          <TabsContent value="mechanics" className="mt-4 lg:mt-0"><MechanicsTab /></TabsContent>
          <TabsContent value="policies" className="mt-4 lg:mt-0">
            <RoleGuard module="Configuración" minAccess="full" fallback={null}>
              <MaintenancePoliciesTab />
            </RoleGuard>
          </TabsContent>
          <TabsContent value="contract-template" className="mt-4 lg:mt-0">
            <RoleGuard module="Configuración" minAccess="full" fallback={null}>
              <ContractTemplateTab />
            </RoleGuard>
          </TabsContent>
          <TabsContent value="fiscal" className="mt-4 lg:mt-0">
            <RoleGuard module="Configuración" minAccess="full" fallback={null}>
              <FiscalDataTab />
            </RoleGuard>
          </TabsContent>
          <TabsContent value="logo" className="mt-4 lg:mt-0">
            <RoleGuard module="Configuración" minAccess="full" fallback={null}>
              <CompanyLogoTab />
            </RoleGuard>
          </TabsContent>
          <TabsContent value="cxp-approval" className="mt-4 lg:mt-0">
            <RoleGuard module="Configuración" minAccess="full" fallback={null}>
              <CxpApprovalTab />
            </RoleGuard>
          </TabsContent>
        </div>
      </Tabs>
    </PageContainer>
  );
}
