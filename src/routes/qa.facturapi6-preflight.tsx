import { createFileRoute } from "@tanstack/react-router";
import { Facturapi6Preview } from "@/features/qa/components/Facturapi6Preview";
export const Route = createFileRoute("/qa/facturapi6-preflight")({
  head: () => ({ meta: [
    { title: "LiftGO · Revisión temporal Facturapi 6" },
    { name: "description", content: "Revisión privada y temporal del emisor sandbox de ELOGISTIX SHIPPING." },
    { property: "og:title", content: "LiftGO · Revisión temporal Facturapi 6" },
    { property: "og:description", content: "Comprobación de lectura deshabilitada hasta revisión." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: Facturapi6Preview,
});
