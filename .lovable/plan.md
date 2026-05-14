# Cleanup obligatorio en useEffect

## Auditoría realizada

Revisé todos los `useEffect` que involucran suscripciones de Supabase, event listeners o temporizadores. Resultado:

| Archivo | Tipo | Cleanup |
|---|---|---|
| `src/contexts/AuthContext.tsx` | `onAuthStateChange` | ✅ |
| `src/pages/AuthPage.tsx` | `onAuthStateChange` | ✅ |
| `src/hooks/use-mobile.tsx` | `addEventListener` | ✅ |
| `src/components/SearchBar.tsx` | `addEventListener` | ✅ |
| `src/components/GlobalSearch.tsx` | `addEventListener` | ✅ |
| `src/components/ImageGalleryLightbox.tsx` | `addEventListener` | ✅ |
| `src/components/ui/sidebar.tsx` | `addEventListener` | ✅ |
| `src/hooks/useDebouncedValue.ts` | `setTimeout` | ✅ |
| `src/lib/routes-config.tsx` | `setTimeout` | ✅ |
| **`src/hooks/useChangelogDeepLink.ts`** | **2× `setTimeout`** | **❌ falta** |

## Cambios propuestos

### 1. Corregir `src/hooks/useChangelogDeepLink.ts`

El `useEffect` dispara dos `setTimeout` (scroll a 100ms y reset de highlight a 2500ms) sin limpiar los timers. Si `changelog` cambia o el componente se desmonta antes de que disparen, intentan tocar el DOM / hacer `setState` en un componente desmontado.

Guardar los IDs y limpiarlos en el return:

```ts
useEffect(() => {
  if (handled.current || changelog.length === 0) return;
  // ...validaciones...
  handled.current = true;
  setExpanded((prev) => new Set(prev).add(version));
  setHighlighted(version);
  const scrollTimer = window.setTimeout(() => {
    document.getElementById(`v${version}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
  const highlightTimer = window.setTimeout(() => setHighlighted(null), 2500);
  return () => {
    window.clearTimeout(scrollTimer);
    window.clearTimeout(highlightTimer);
  };
}, [changelog]);
```

### 2. Persistir la regla en memoria del proyecto

Agregar un memory file `mem://arch/useEffect-cleanup` con la regla:

> Todo `useEffect` que cree suscripciones (Supabase channels, `onAuthStateChange`), event listeners (`addEventListener`) o temporizadores (`setTimeout`/`setInterval`) **debe** retornar una función de limpieza que las desmonte. Aplica también a hooks personalizados.

Y referenciarlo desde `mem://index.md` en la sección Memories.

### 3. Changelog

Agregar entrada `5.66.6` (patch) en `public/changelog.json` y archivo detalle `public/changelog/v5.66.6.json` describiendo el fix de cleanup en `useChangelogDeepLink`.

## Archivos afectados

- `src/hooks/useChangelogDeepLink.ts` (fix)
- `mem://arch/useEffect-cleanup` (nuevo)
- `mem://index.md` (referencia)
- `public/changelog.json` + `public/changelog/v5.66.6.json`
