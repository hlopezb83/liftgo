import { createFileRoute, redirect } from "@tanstack/react-router";

// Alias histórico preservado del router Classic (R12-UIX-08 y afines).
export const Route = createFileRoute("/_main/cash-flow")({
  beforeLoad: () => {
    throw redirect({ to: "/flujo-de-caja", replace: true });
  },
});
