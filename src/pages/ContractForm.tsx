import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useContract, useCreateContract, useUpdateContract } from "@/hooks/useContracts";
import { useCustomers } from "@/hooks/useCustomers";
import { useForklifts } from "@/hooks/useForklifts";
import { FormPageHeader } from "@/components/FormPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ContractForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { data: existing } = useContract(isEdit ? id : undefined);
  const { data: customers } = useCustomers();
  const { data: forklifts } = useForklifts();
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();

  const [form, setForm] = useState({
    customer_id: "",
    forklift_id: "",
    start_date: "",
    end_date: "",
    daily_rate: "0",
    weekly_rate: "0",
    monthly_rate: "0",
    deposit_amount: "0",
    terms_text: "",
    signed_by: "",
    notes: "",
  });

  useEffect(() => {
    if (existing && isEdit) {
      setForm({
        customer_id: existing.customer_id || "",
        forklift_id: existing.forklift_id || "",
        start_date: existing.start_date || "",
        end_date: existing.end_date || "",
        daily_rate: String(existing.daily_rate || 0),
        weekly_rate: String(existing.weekly_rate || 0),
        monthly_rate: String(existing.monthly_rate || 0),
        deposit_amount: String(existing.deposit_amount || 0),
        terms_text: existing.terms_text || "",
        signed_by: existing.signed_by || "",
        notes: existing.notes || "",
      });
    }
  }, [existing, isEdit]);

  // Auto-fill rates when forklift changes
  useEffect(() => {
    if (!isEdit && form.forklift_id && forklifts) {
      const fl = forklifts.find((f) => f.id === form.forklift_id);
      if (fl) {
        setForm((prev) => ({
          ...prev,
          daily_rate: String(fl.daily_rate || 0),
          weekly_rate: String(fl.weekly_rate || 0),
          monthly_rate: String(fl.monthly_rate || 0),
        }));
      }
    }
  }, [form.forklift_id, forklifts, isEdit]);

  const handleSubmit = () => {
    if (!form.customer_id || !form.forklift_id) {
      toast.error("Customer and equipment are required");
      return;
    }
    const payload = {
      customer_id: form.customer_id,
      forklift_id: form.forklift_id,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      daily_rate: Number(form.daily_rate),
      weekly_rate: Number(form.weekly_rate),
      monthly_rate: Number(form.monthly_rate),
      deposit_amount: Number(form.deposit_amount),
      terms_text: form.terms_text || null,
      signed_by: form.signed_by || null,
      notes: form.notes || null,
      booking_id: null,
      status: "draft",
      signed_at: null,
    };

    if (isEdit) {
      updateContract.mutate({ id, ...payload }, {
        onSuccess: () => { toast.success("Contract updated"); navigate(`/contracts/${id}`); },
      });
    } else {
      createContract.mutate(payload, {
        onSuccess: (data: any) => { toast.success("Contract created"); navigate(`/contracts/${data.id}`); },
      });
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <FormPageHeader title={isEdit ? "Edit Contract" : "New Contract"} onBack={() => navigate("/contracts")} />

      <Card>
        <CardHeader><CardTitle className="text-base">General Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Customer *</Label>
              <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {(customers || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Equipment *</Label>
              <Select value={form.forklift_id} onValueChange={(v) => setForm({ ...form, forklift_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select equipment" /></SelectTrigger>
                <SelectContent>
                  {(forklifts || []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rates & Deposit</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><Label>Daily</Label><Input type="number" step="0.01" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} /></div>
            <div><Label>Weekly</Label><Input type="number" step="0.01" value={form.weekly_rate} onChange={(e) => setForm({ ...form, weekly_rate: e.target.value })} /></div>
            <div><Label>Monthly</Label><Input type="number" step="0.01" value={form.monthly_rate} onChange={(e) => setForm({ ...form, monthly_rate: e.target.value })} /></div>
            <div><Label>Deposit</Label><Input type="number" step="0.01" value={form.deposit_amount} onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Terms</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Terms & Conditions</Label>
            <Textarea rows={6} value={form.terms_text} onChange={(e) => setForm({ ...form, terms_text: e.target.value })} placeholder="Rental contract terms..." />
          </div>
          <div>
            <Label>Signed by</Label>
            <Input value={form.signed_by} onChange={(e) => setForm({ ...form, signed_by: e.target.value })} placeholder="Signee name" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 pt-2">
        <Button onClick={handleSubmit} disabled={createContract.isPending || updateContract.isPending}>
          {isEdit ? "Save Changes" : "Create Contract"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/contracts")}>Cancel</Button>
      </div>
    </div>
  );
}
