import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  customerName: string | null | undefined;
  rfc?: string | null;
  cp?: string | null;
}

export function QuoteCustomerCard({ customerName, rfc, cp }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
      <CardContent>
        <p className="font-medium">{customerName ?? "—"}</p>
        {rfc && <p className="text-sm text-muted-foreground">RFC: {rfc}</p>}
        {cp && <p className="text-sm text-muted-foreground">C.P. {cp}</p>}
      </CardContent>
    </Card>
  );
}
