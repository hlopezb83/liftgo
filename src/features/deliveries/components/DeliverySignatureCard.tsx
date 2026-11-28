import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DeliverySignatureCard({ signatureBase64 }: { signatureBase64: string | null | undefined }) {
  if (!signatureBase64) return null;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Firma del Cliente</CardTitle></CardHeader>
      <CardContent>
        {/* intentional: bg-white mimics paper background for the client signature preview */}
        <img src={signatureBase64} alt="Firma" className="max-h-32 border rounded-md bg-white" />
      </CardContent>
    </Card>
  );
}
