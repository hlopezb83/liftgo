import { Navigate } from "@/lib/router-compat-ui";

export default function CompanySettingsPage() {
  // Los datos fiscales de la organización viven dentro de Configuración como
  // pestañas. No hay logo editable por empresa: el logo de LiftGo es global.
  return <Navigate to="/settings/operations" replace />;
}
