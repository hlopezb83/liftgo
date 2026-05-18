## Objetivo
Quitar el botón flotante "Reportar" (esquina inferior derecha) y reubicarlo como un botón pequeño fijo en el header superior, justo al lado izquierdo del buscador global (Ctrl+K).

## Cambios

### 1. `src/features/feedback/components/FeedbackFab.tsx`
Renombrar conceptualmente a un botón compacto de header (mantengo el nombre del archivo para no romper imports, o lo renombro a `FeedbackHeaderButton.tsx`).

- Quitar clases de posicionamiento fijo (`fixed bottom-5 right-5 z-40 h-12 rounded-full shadow-lg`).
- Cambiar a `variant="outline"` `size="sm"` con altura `h-8`, mismo estilo visual que el botón de `GlobalSearch` para que combinen.
- Mostrar ícono `MessageSquarePlus` siempre y la palabra "Reportar" oculta en móvil (`hidden md:inline`), igual que el patrón del buscador.
- Mantiene el `FeedbackFormDialog` tal cual.

### 2. `src/layouts/MainLayout.tsx`
- Eliminar `<FeedbackFab />` del final del layout.
- Insertarlo en el `<header>`, **antes** de `<GlobalSearch />`, dentro del mismo contenedor flex.

### 3. Changelog (`public/changelog.json` + nuevo `public/changelog/v6.3.3.json`)
- Entrada **patch** `6.3.3`: "Botón Reportar reubicado al header" — descripción breve de UX (más limpio, no tapa contenido en mobile, consistente con el buscador).

## Resultado visual
```
┌───────────────────────────────────────────────────────────┐
│ ☰  Inicio / Panel        [📝 Reportar] [🔍 Buscar… Ctrl+K]│
├───────────────────────────────────────────────────────────┤
│                       contenido                            │
```

## Fuera de alcance
- No se cambia el formulario de feedback ni su lógica.
- No se mueve a la sidebar ni se agregan nuevas vistas.