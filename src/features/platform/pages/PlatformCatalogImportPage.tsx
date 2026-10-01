import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { PlatformCatalogImportCard } from "../components/catalogImport/PlatformCatalogImportCard";

export default function PlatformCatalogImportPage() {
  return <div className="space-y-6">
    <PageHeader title="Incorporación de maestros" subtitle="Revisión de nuevos modelos, SKUs y machotes desde la empresa de origen"
      actions={<Button variant="outline" asChild><Link to="/platform/catalogs">Volver al catálogo LiftGo</Link></Button>} />
    <PlatformCatalogImportCard />
  </div>;
}
