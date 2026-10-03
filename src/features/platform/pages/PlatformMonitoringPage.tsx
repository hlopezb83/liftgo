import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
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
      <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">La latencia corresponde a las comprobaciones de Facturapi. Consulta errores y registros en sus herramientas originales; estos enlaces requieren acceso a cada servicio.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button asChild variant="outline" className="min-h-11"><a href="https://elogistix.sentry.io/issues/" target="_blank" rel="noopener noreferrer">Abrir errores en Sentry</a></Button>
        <Button asChild variant="outline" className="min-h-11"><a href="https://lovable.dev/projects/e25ace4a-172e-4082-a037-00473dacf2f2" target="_blank" rel="noopener noreferrer">Abrir Lovable Cloud</a></Button>
      </div>
    </section>
  </>;
}
