import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-fade-in", className)}>
      {children}
    </div>
  );
}
