# Documentación de LiftGo

Revisada el 29 de septiembre de 2026. Este índice separa las guías operativas
de los informes que describen una revisión fechada.

## Fuentes de verdad

1. Código, pruebas, workflows y migraciones describen lo que el repositorio
   implementa. CI acredita únicamente el commit que ejecutó.
2. `public/changelog.json` es el historial funcional consumido por la app;
   `CHANGELOG.md` es su espejo legible para GitHub.
3. La base Lovable Cloud, Storage, secretos, usuarios, respaldos y despliegues
   son estado externo: Git no confirma su contenido. Registra verificaciones
   fechadas en los runbooks.
4. `docs/audits/` y `multiempresa/tramo-*` son snapshots. No representan el
   backlog ni el estado de hoy salvo que una revisión actual lo confirme.

## Para empezar

- [README](../README.md): requisitos, comandos y flujo de desarrollo.
- [Arquitectura](../architecture.md): módulos, capas, integraciones e invariantes.
- [Roadmap operativo](../roadmap.md): siguientes pasos y gates con evidencia.
- [CI](./ci.md): workflows, cuatro shards de Vitest y pruebas fuera de CI.
- [Guardrails de arquitectura](./architecture-guardrails.md): reglas de
  `scripts/arch-check.sh` y ESLint.
- [Política de migraciones](./migrations.md): historial legado, Drizzle y
  verificación en Lovable Cloud.

## Multiempresa y ecosistema LiftGo

- [Centro de Plataforma](./platform-center.md): acceso global, rutas,
  separación de caché y etapas pendientes.
- [Estado multiempresa](./multiempresa/onboarding.md): evidencia del código y
  límites de certeza externos.
- [Gates para varias organizaciones](./multiempresa/gates-segunda-organizacion.md):
  pruebas aisladas A/B y restauración.
- [Historial de Storage](./multiempresa/storage-historico.md): snapshots; sus
  cifras y estados no son actuales.
- [Plan del ecosistema compartido](./shared-ecosystem/implementation-plan.md):
  datos globales LiftGo, datos locales y propuestas futuras.

## Desarrollo y operación

- [Inventario de Edge Functions](./functions-inventory.md): código bajo
  `supabase/functions/`; no acredita qué funciones están desplegadas.
- [Paginación incremental](./paginacion-incremental.md): páginas por
  desplazamiento (`range`), no keyset cursor.
- [E2E de Playwright](../tests/e2e/README.md): comandos, variables y guardas
  para evitar producción.
- [Pruebas SQL de RLS](../supabase/tests/rls/README.md): base efímera y comando local.
- [Auditoría Facturapi](./facturapi-audit-2026-09-25.md): snapshot del 25 de
  septiembre; no certifica configuración actual.
- `docs/audits/`: informes fechados útiles para trazabilidad, no backlog sin
  revalidación.
