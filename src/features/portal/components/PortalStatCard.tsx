import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  valueClassName?: string;
}

export function PortalStatCard({ title, value, icon, valueClassName }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${valueClassName ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
