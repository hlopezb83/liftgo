# Plan: Partir `components/ui/sidebar.tsx` (#5 del audit)

Único item crítico pendiente. Objetivo: dividir el shadcn primitive de 637 LOC sin cambiar comportamiento ni romper a ningún consumer.

## Estrategia

Convertir `src/components/ui/sidebar.tsx` en un directorio `src/components/ui/sidebar/` con un `index.ts` que re-exporta todo. Todos los `import { ... } from "@/components/ui/sidebar"` siguen funcionando sin tocar consumers.

## Estructura objetivo

```
src/components/ui/sidebar/
  index.ts            ← re-exports públicos (23 símbolos)
  constants.ts        ← cookies, widths, atajo de teclado, breakpoint
  variants.ts         ← cva() de SidebarMenuButton
  context.tsx         ← SidebarProvider + useSidebar + tipos del contexto
  Sidebar.tsx         ← Sidebar (desktop/mobile/floating) + SidebarInset + SidebarRail + SidebarTrigger
  SidebarSections.tsx ← SidebarHeader, SidebarFooter, SidebarContent, SidebarSeparator, SidebarInput
  SidebarGroup.tsx    ← SidebarGroup, SidebarGroupLabel, SidebarGroupAction, SidebarGroupContent
  SidebarMenu.tsx     ← SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarMenuBadge, SidebarMenuSkeleton
  SidebarMenuSub.tsx  ← SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton
```

Cada archivo ≤150 LOC. Eliminar el archivo original `sidebar.tsx` al final.

## Reglas no-funcionales

- Copiar el código tal cual (mismos className, cva, props, displayNames). Cero cambios visuales o de comportamiento.
- Mantener `forwardRef` y `displayName` en todos los componentes.
- `useSidebar` y `SidebarContext` viven en `context.tsx`.
- El barrel `index.ts` exporta exactamente los 23 símbolos actuales para no romper imports.

## Verificación

1. `bunx tsc --noEmit` debe pasar.
2. Smoke manual: abrir el preview, colapsar/expandir el sidebar, abrir el sheet móvil, navegar entre rutas. No debe haber diferencias visuales.
3. `rg "from \"@/components/ui/sidebar\"" src | wc -l` antes y después debe coincidir.

## Changelog

`v6.74.1` (patch, refactor estructural sin cambios funcionales):
- `public/changelog.json` + `public/changelog/v6.74.1.json`.

## Fuera de alcance

Recomendaciones #6 en adelante del audit (constantes adicionales, renames kebab-case, knip, descomponer god components secundarios). Iteraciones futuras.
