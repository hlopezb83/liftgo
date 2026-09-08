import { Navigate } from "@/lib/router-compat-ui";

export default function CompanySettingsPage() {
  // Datos fiscales y logo ahora viven dentro de Configuración como pestañas.
  return <Navigate to="/settings/operations" replace />;
}
