import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserIcon } from "@/components/icons";

interface Props {
  customerName: string | null | undefined;
  rfc?: string | null;
  cp?: string | null;
}

export function QuoteCustomerCard({ customerName, rfc, cp }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" /> Cliente
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-medium">{customerName ?? "—"}</p>
        {rfc && <p className="text-sm text-muted-foreground">RFC: {rfc}</p>}
        {cp && <p className="text-sm text-muted-foreground">C.P. {cp}</p>}
      </CardContent>
    </Card>
  );
}

