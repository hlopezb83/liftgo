
## Diagnóstico

Se auditaron 247 archivos que importan de `@/components/icons`. El registry está montado y el ESLint guard funciona, pero **la adopción real es baja**:

| Métrica | Estado |
|---|---|
| Archivos que usan `<Icon>` wrapper (tokens xs/sm/md/lg/xl) | **0 / 247** |
| Archivos que usan al menos un alias semántico (`DeleteIcon`, `EditIcon`, …) | **2 / 247** |
| Archivos con tamaño hardcodeado `h-4 w-4` / `h-5 w-5` | **211** |
| `Trash2` importado crudo (debería ser `DeleteIcon`) | 35 archivos |
| `Plus` crudo (debería ser `AddIcon`) | 28 |
| `FileText` crudo (debería ser `DocumentIcon`) | 26 |
| `AlertTriangle` crudo (debería ser `WarnIcon`) | 24 |
| `Loader2` crudo (debería ser `SpinnerIcon`) | 21 |
| `Pencil` crudo (debería ser `EditIcon`) | 20 |

### Drift semántico detectado

1. **Éxito duplicado**: `CheckCircle2` en 13 archivos + `CheckCircle` en 8 archivos + `Check` suelto — todos deberían ser `SuccessIcon`.
2. **Cerrar vs error**: `X` (11) usado como cerrar modal, `XCircle` (9) como error, sin distinción — usar `CloseIcon` vs `ErrorIcon`.
3. **Añadir**: `Plus` (28) y `PlusCircle` (2) mezclados — canonizar `AddIcon`.
4. **Fleet inconsistente**: `Truck` (14) y `TruckIcon` alias local (2) — usar `FleetIcon`.
5. **Tamaños ad-hoc**: `h-3 w-3`, `h-4 w-4`, `h-5 w-5`, `h-6 w-6` mezclados sin criterio en 211 archivos — reemplazar por tokens `size="xs|sm|md|lg|xl"` del wrapper.
6. **Stroke width**: nadie usa el default `1.75` del wrapper — todo llega con el 2 default de lucide, rompiendo la línea visual del registry.

## Plan

### Lote 1 — Ampliar registry y tokens (bajo riesgo)
- Agregar aliases faltantes en `src/components/icons/index.ts`:
  - `MapPin → LocationIcon`, `Settings → SettingsIcon`, `LayoutDashboard → DashboardIcon`, `Home → HomeIcon`, `Star → StarIcon`, `HelpCircle → HelpIcon`, `KeyRound → KeyIcon`, `Stamp → StampIcon`, `Handshake → DealIcon`, `Target → TargetIcon`, `Activity → ActivityIcon`, `BarChart3 → ChartIcon`, `TrendingDown → TrendingDownIcon`, `Landmark → BankIcon`, `Undo2 → UndoIcon`, `RotateCcw → ResetIcon`, `EyeOff → HideIcon`, `Minus → RemoveIcon`, `Info → InfoIcon`.
- Documentar en el JSDoc del index qué alias usar para cada acción/estado.

### Lote 2 — Migración masiva a aliases semánticos
Codemod (ripgrep + sed asistido) sobre los 247 archivos:
- `Trash2` → `DeleteIcon`
- `Pencil` → `EditIcon`
- `Plus` / `PlusCircle` → `AddIcon`
- `FileText` → `DocumentIcon`
- `Receipt` → `InvoiceIcon`
- `Truck` / `TruckIcon` local → `FleetIcon`
- `Wrench` → `MaintenanceIcon`
- `CheckCircle` / `CheckCircle2` / `Check` (cuando denote éxito) → `SuccessIcon`
- `AlertTriangle` → `WarnIcon`
- `XCircle` → `ErrorIcon`
- `AlertCircle` → `InfoAlertIcon`
- `Loader2` → `SpinnerIcon`
- `X` en botones de cerrar → `CloseIcon`
- `Save`, `Copy`, `RefreshCw`, `Download`, `Upload`, `Eye`, `Search`, `DollarSign`, `Calendar`, `Clock`, `User`, `Users`, `Building2`, `ShieldCheck`, `Package`, `History`, `Phone`, `TrendingUp`, `Trophy` → sus aliases correspondientes.

**Regla de escape**: cuando el ícono es puramente decorativo/marketing sin semántica CRUD, dejar el nombre crudo (permitido por el re-export `export * from "lucide-react"`).

### Lote 3 — Adopción del wrapper `<Icon>` y tokens de tamaño
- Reemplazar `className="h-3 w-3"` → `size="xs"`, `h-4 w-4` → `size="sm"`, `h-5 w-5` → `size="md"`, `h-6 w-6` → `size="lg"`, `h-8 w-8` → `size="xl"` en los 211 archivos.
- Migrar los sitios de alto impacto visual (botones, `ListToolbar`, `StatusBadge`, `DetailPageHeader`, `KpiTile`, sidebar) primero para asegurar el stroke 1.75 consistente.
- Los íconos dentro de `<Button>` shadcn mantienen `className` de color (`text-destructive`, etc.), solo cambia el tamaño.

### Lote 4 — Verificación y guardas
- Añadir ESLint custom rule (o pattern `no-restricted-syntax`) que marque `<Trash2 />`, `<Pencil />`, `<CheckCircle2 />` como warning con mensaje "usa el alias semántico".
- Ampliar el snapshot test del registry: enumerar aliases y garantizar que cada uno resuelve a un componente válido.
- `tsgo` + `bun lint` + `bunx vitest run` (843 tests) verdes.
- Medir bundle del chunk `icons` antes/después (esperado: sin cambio material — mismo tree-shake).

### Lote 5 — Documentación
- Actualizar `mem://design/icons-registry.md` con: tabla de aliases canónicos por dominio, cuándo usar `size` token vs `className`, y el ejemplo de escape para íconos ad-hoc.
- Changelog `v7.10.0` (minor: mejora arquitectural sin cambio de UX).

## Detalles técnicos

- El re-export `export * from "lucide-react"` seguirá permitido para no romper íconos ad-hoc, pero los aliases canónicos serán la vía preferida y la ESLint rule empujará hacia ellos.
- El wrapper `Icon` acepta `iconNode` y aplica `strokeWidth={1.75}` + tokens de tamaño; se puede seguir usando `<DeleteIcon />` directo cuando basta el default de lucide (16 px).
- Riesgo bajo: sin cambios de comportamiento, solo renombres y tokens de tamaño. Sin migraciones de DB ni de edge functions.

## Alcance estimado
- ~247 archivos tocados por el codemod (Lote 2).
- ~211 archivos tocados por Lote 3.
- Cero cambios de lógica de negocio; solo capa de presentación.
