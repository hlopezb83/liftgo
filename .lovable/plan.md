

## Corrección: Mostrar fabricante y modelo en el selector de montacargas

### Problema
El `ForkliftSelector.tsx` muestra los montacargas como `{name} — {model}` (ej: "MCGSC025A048/010 — FG30L"), cuando debería mostrar el fabricante y modelo de forma descriptiva: `{manufacturer} {model} — {name}`.

### Cambios

**Archivo único:** `src/components/ForkliftSelector.tsx`

1. **Línea 27** (SingleSelect): Cambiar `{f.name} — {f.model}` → `{f.manufacturer} {f.model} — {f.name}`
2. **Línea 64** (getForkliftLabel en MultiSelect): Cambiar el formato del label para incluir manufacturer
3. **Línea 90** (MultiSelect dropdown): Cambiar `{f.name} — {f.model}` → `{f.manufacturer} {f.model} — {f.name}`

### Resultado esperado
El dropdown mostrará: "LIFT GO FG30L — MCGSC025A048/010" en lugar de "MCGSC025A048/010 — FG30L"

### Changelog
Agregar entrada v3.6.1 patch en `src/lib/changelog.ts`.

