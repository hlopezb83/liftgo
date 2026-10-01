import { createFileRoute } from "@tanstack/react-router";
import { PlatformGuard, PlatformLayout } from "@/features/platform";

export const Route = createFileRoute("/platform")({
  component: () => <PlatformGuard><PlatformLayout /></PlatformGuard>,
});
