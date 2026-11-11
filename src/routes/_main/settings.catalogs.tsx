import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/settings/catalogs")({
  beforeLoad: () => {
    throw redirect({ to: "/platform/catalogs", replace: true });
  },
});
