

# Corregir observaciones menores en AuditTrailPage

## Resumen

Consolidar las importaciones duplicadas de `@/components/ui/table` en `AuditTrailPage.tsx`. Actualmente hay dos lineas de import separadas (lineas 10 y 13) que importan desde el mismo modulo.

## Cambio

### Archivo: `src/pages/AuditTrailPage.tsx`

Combinar las dos lineas de import:

**Antes (lineas 10 y 13):**
```text
import { TableRow, TableCell, TableHead } from "@/components/ui/table";
...
import { Table, TableBody, TableHeader } from "@/components/ui/table";
```

**Despues (una sola linea):**
```text
import { Table, TableBody, TableHeader, TableRow, TableCell, TableHead } from "@/components/ui/table";
```

Eliminar la linea en blanco sobrante (linea 12) que quedaba entre los dos imports.

---

Este es un cambio cosmetico que no afecta funcionalidad, solo mejora la legibilidad del codigo.
