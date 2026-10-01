import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CompletedOnboarding } from "@/lib/platformOnboarding.types";
import {
  usePendingPlatformOnboarding,
  useResumePlatformOnboarding,
} from "../hooks/usePlatformOnboarding";

export function PendingPlatformOnboarding({
  onCompleted,
}: {
  onCompleted: (result: CompletedOnboarding) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const query = usePendingPlatformOnboarding(offset);
  const resume = useResumePlatformOnboarding();
  async function run(requestId: string) {
    setMessage(null);
    try {
      const result = await resume.mutateAsync({ request_id: requestId });
      if (result.success) {
        onCompleted(result);
        setOffset(0);
      } else setMessage(result.message);
    } catch {
      /* El hook informa el error y refresca el estado persistido. */
    } finally {
      resume.reset();
    }
  }
  if (query.isPending) return <Skeleton className="h-20 w-full" />;
  if (query.isError)
    return (
      <QueryErrorState
        entity="las altas pendientes"
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    );
  if (!query.data.total) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Altas pendientes ({query.data.total})</CardTitle>
        <p className="text-sm text-muted-foreground">
          Estas empresas siguen sin acceso. Reanudar conserva la empresa y el
          administrador reservados.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <Alert role="status">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <ul className="divide-y">
          {query.data.jobs.map((job) => (
            <li
              key={job.request_id}
              className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="break-words font-medium">{job.name}</p>
                <p className="break-words text-sm text-muted-foreground">
                  {job.admin_full_name} · {job.admin_email}
                </p>
                <Badge variant="secondary">
                  {job.stage === "admin_pending"
                    ? "Vincular administrador"
                    : "Crear cuenta de acceso"}
                </Badge>
              </div>
              <Button
                variant="outline"
                className="shrink-0"
                disabled={resume.isPending}
                aria-label={`Reanudar alta de ${job.name}`}
                onClick={() => void run(job.request_id)}
              >
                {resume.isPending &&
                resume.variables?.request_id === job.request_id
                  ? "Verificando…"
                  : "Reanudar alta"}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Página {Math.floor(offset / 20) + 1} de{" "}
            {Math.max(1, Math.ceil(query.data.total / 20))}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!offset || resume.isPending}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={offset + 20 >= query.data.total || resume.isPending}
              onClick={() => setOffset(offset + 20)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
