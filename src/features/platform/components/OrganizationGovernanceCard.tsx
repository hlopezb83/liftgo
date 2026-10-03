import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationGovernance } from "../hooks/useOrganizationGovernance";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { OrganizationGovernanceEditor } from "./OrganizationGovernanceEditor";
import { OrganizationGovernanceSummary } from "./OrganizationGovernanceSummary";

export function OrganizationGovernanceCard({ organizationId }: { organizationId: string }) {
  const { can } = usePlatformCapabilities();
  const query = useOrganizationGovernance(organizationId);
  const [editing, setEditing] = useState(false);
  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
      <CardTitle className="text-base">Territorio y contacto</CardTitle>
      {can("organizations.configure") && <Button variant="outline" size="sm" disabled={!query.data} onClick={() => setEditing(true)}>Editar datos</Button>}
    </CardHeader>
    <CardContent className="space-y-4">
      {query.isError ? <QueryErrorState error={query.error} entity="los datos administrativos de la empresa"
        onRetry={() => void query.refetch()} isRetrying={query.isFetching} /> :
        query.data ? <OrganizationGovernanceSummary data={query.data} /> : <Skeleton className="h-32 w-full" />}
      <p className="text-xs text-muted-foreground">Estos datos se administran por empresa. La identidad fiscal, los bancos, los precios y las existencias se conservan en su ERP.</p>
    </CardContent>
    {editing && query.data && can("organizations.configure") && <OrganizationGovernanceEditor
      initial={query.data} onClose={() => setEditing(false)}
      reload={async () => { const result = await query.refetch(); if (result.error) throw result.error; return result.data; }} />}
  </Card>;
}
