import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/settings/organizations")({
  beforeLoad: () => {
    throw redirect({ to: "/platform/organizations", replace: true });
  },
});
