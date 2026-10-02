import { PageHeader } from "@/components/layout/PageHeader";
import { useCurrentVersion } from "@/features/changelog";
import { PlatformHealthOverview } from "../components/PlatformHealthOverview";
import { healthDate, usePlatformMonitoring } from "../hooks/usePlatformHealth";

export default function PlatformMonitoringPage() {
  const version = useCurrentVersion();
  const query = usePlatformMonitoring();
  return <>
    <PageHeader title="Monitoreo de plataforma" subtitle="Estado operativo registrado y fuentes de comprobación." />
    <PlatformHealthOverview />
    <section aria-label="Fuentes de monitoreo" className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Fuentes y alcance</h2>
      <dl className="mt-4 grid gap-5 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Versión anunciada por este despliegue</dt><dd className="mt-1 font-medium">{version ? `v${version}` : "No disponible"}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Última comprobación de Facturapi registrada</dt><dd className="mt-1 font-medium">{healthDate(query.data?.lastCheckAt)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Cola fiscal</dt><dd className="mt-1 text-sm">Trabajos registrados en el ERP. Los reintentos conservan los límites y la conciliación existentes.</dd></div>
        <div><dt className="text-sm text-muted-foreground">Reportes</dt><dd className="mt-1 text-sm">Reportes abiertos enviados por usuarios. No es un conteo automático de todos los errores.</dd></div>
      </dl>
      <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">La latencia disponible corresponde a las comprobaciones de Facturapi. La telemetría general, los respaldos y las restauraciones todavía no tienen una fuente conectada a este panel.</p>
    </section>
  </>;
}
