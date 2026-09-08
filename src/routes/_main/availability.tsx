import { createFileRoute, redirect } from "@tanstack/react-router";

// Alias histórico preservado del router Classic (R12-UIX-08 y afines).
export const Route = createFileRoute("/_main/availability")({
  beforeLoad: () => {
    throw redirect({ to: "/calendar", replace: true });
  },
});
