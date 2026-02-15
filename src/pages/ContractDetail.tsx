import { useParams, useNavigate } from "react-router-dom";
import { useContract, useUpdateContract } from "@/hooks/useContracts";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Send, CheckCircle, XCircle, Edit } from "lucide-react";
import { ContractPDFButton } from "@/components/ContractPDFButton";
import { toast } from "sonner";

export default function ContractDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: contract, isLoading } = useContract(id);
  const updateContract = useUpdateContract();

  const setStatus = (status: string, extra?: Record<string, any>) => {
    if (!id) return;
    updateContract.mutate(
      { id, status, ...extra },
      { onSuccess: () => toast.success(`Contract marked as ${status}`) }
    );
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!contract) return <div className="p-6 text-muted-foreground">Contract not found</div>;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/contracts")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{contract.contract_number}</h1>
            <StatusBadge status={contract.status} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {contract.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/contracts/${id}/edit`)}><Edit className="h-4 w-4 mr-1" />Edit</Button>
              <Button size="sm" onClick={() => setStatus("sent")}><Send className="h-4 w-4 mr-1" />Mark Sent</Button>
            </>
          )}
          {contract.status === "sent" && (
            <Button size="sm" onClick={() => setStatus("signed", { signed_at: new Date().toISOString() })}>
              <CheckCircle className="h-4 w-4 mr-1" />Mark Signed
            </Button>
          )}
          {(contract.status === "draft" || contract.status === "sent") && (
            <Button variant="destructive" size="sm" onClick={() => setStatus("cancelled")}>
              <XCircle className="h-4 w-4 mr-1" />Cancel
            </Button>
          )}
          {id && <ContractPDFButton contract={contract} />}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{contract.customer_name || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Equipment</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{contract.forklift_name || "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Contract Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground block">Start</span>{contract.start_date || "—"}</div>
            <div><span className="text-muted-foreground block">End</span>{contract.end_date || "—"}</div>
            <div><span className="text-muted-foreground block">Deposit</span>{formatCurrency(Number(contract.deposit_amount || 0))}</div>
            <div><span className="text-muted-foreground block">Daily Rate</span>{formatCurrency(Number(contract.daily_rate || 0))}</div>
            <div><span className="text-muted-foreground block">Weekly Rate</span>{formatCurrency(Number(contract.weekly_rate || 0))}</div>
            <div><span className="text-muted-foreground block">Monthly Rate</span>{formatCurrency(Number(contract.monthly_rate || 0))}</div>
            {contract.signed_at && <div><span className="text-muted-foreground block">Signed</span>{new Date(contract.signed_at).toLocaleDateString()}</div>}
            {contract.signed_by && <div><span className="text-muted-foreground block">Signed by</span>{contract.signed_by}</div>}
          </div>
        </CardContent>
      </Card>

      {contract.terms_text && (
        <Card>
          <CardHeader><CardTitle className="text-base">Terms & Conditions</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{contract.terms_text}</p></CardContent>
        </Card>
      )}

      {contract.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{contract.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
