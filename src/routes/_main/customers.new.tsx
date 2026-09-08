import { createFileRoute, redirect } from "@tanstack/react-router";

// Alias histórico preservado del router Classic (R12-UIX-08 y afines).
export const Route = createFileRoute("/_main/customers/new")({
  beforeLoad: () => {
    throw redirect({ to: "/customers", replace: true, search: {"new":"1"} as never });
  },
});
